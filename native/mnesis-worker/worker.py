"""
Mnesis worker for Lexicon (memory.md Phase 1 skeleton).

A stdio JSON-RPC sidecar that owns Mnesis sessions for conversation-context
compaction. The Electron main process spawns this with Python and speaks
newline-delimited JSON (ndjson):

  request:  {"id": 1, "op": "record", "params": {...}}\n
  response: {"id": 1, "ok": true, "result": {...}}\n   or
            {"id": 1, "ok": false, "error": "..."}\n

Protocol ops:
  ping     {}                          -> {"mnesis": true|false, "version": str}
  record   {documentId, userMessage,
            assistantResponse,
            tokens?: {input, output}}  -> RecordResult fields
  messages {documentId}                -> [{"role", "content"}, ...]
  close    {documentId}                -> {}
  forget   {documentId}                -> {"sessionsDeleted": n, "messagesDeleted": n}
                                         (whole-session disposal, §11)
  shutdown {}                          -> {} (process exits after ack)

Usage:
  python worker.py --db <sqlite path> --model <model string>

Degrades gracefully: if the mnesis package is not installed, `ping` reports
{"mnesis": false} and all other ops return an error. The TS client treats an
unavailable worker as a no-op (kill switch, mnesis-phase0-spike.md §Verdict).

Logs go to stderr; stdout carries only protocol frames.

Pinned per the Phase 0 spike: mnesis==0.3.0 (see requirements.txt).
"""

import argparse
import asyncio
import json
import logging
import sys

MNESIS_VERSION = "0.3.0"

try:
    from mnesis import MnesisSession, MnesisConfig, StoreConfig, TokenUsage  # type: ignore

    HAVE_MNESIS = True
except ImportError:  # graceful degradation — never crash the host
    HAVE_MNESIS = False


class Worker:
    """Owns one Mnesis session per documentId."""

    def __init__(self, db_path: str, model: str):
        self.db_path = db_path
        self.model = model
        self.sessions: dict = {}

    def _config(self) -> "MnesisConfig":
        return MnesisConfig(store=StoreConfig(db_path=self.db_path))

    async def _session(self, document_id: str) -> "MnesisSession":
        session = self.sessions.get(document_id)
        if session is None:
            session = await MnesisSession.create(
                model=self.model,
                # document-addressable: the sessions.agent column records which
                # document owns each session, so forget() can dispose of all of
                # them (memory.md §11 whole-session disposal).
                agent=document_id,
                config=self._config(),
            )
            self.sessions[document_id] = session
        return session

    async def ping(self) -> dict:
        return {"mnesis": HAVE_MNESIS, "version": MNESIS_VERSION}

    async def record(self, params: dict) -> dict:
        session = await self._session(params["documentId"])
        tokens = params.get("tokens")
        result = await session.record(
            user_message=params["userMessage"],
            assistant_response=params["assistantResponse"],
            tokens=TokenUsage(input=tokens["input"], output=tokens["output"])
            if tokens
            else None,
        )
        return {
            "userMessageId": result.user_message_id,
            "assistantMessageId": result.assistant_message_id,
            "compactionTriggered": result.compaction_triggered,
        }

    async def messages(self, params: dict) -> list:
        session = await self._session(params["documentId"])
        history = await session.messages()
        return [{"role": m.role, "content": m.text_content()} for m in history]

    async def close(self, params: dict) -> dict:
        session = self.sessions.pop(params["documentId"], None)
        if session is not None:
            await session.close()
        return {}

    async def forget(self, params: dict) -> dict:
        """Whole-session disposal for a document (memory.md §11).

        mnesis 0.3.0 has no per-message deletion API, and its supported
        `soft_delete_session` retains all message rows. True disposal is
        therefore a hard row delete of every session owned by the document
        (sessions.agent = documentId): messages, parts, context items, and
        summary/compaction nodes go with it, so nothing can reappear through
        summaries or replay. Sessions created by older workers (agent
        'default') are not document-addressable and are left alone.
        """
        document_id = params["documentId"]
        session = self.sessions.pop(document_id, None)
        if session is not None:
            try:
                await session.close()
            except Exception as exc:  # best-effort — disposal proceeds
                print(f"forget: close({document_id}) failed: {exc}", file=sys.stderr)

        def _purge() -> dict:
            import sqlite3

            conn = sqlite3.connect(self.db_path)
            try:
                cur = conn.execute(
                    "SELECT id FROM sessions WHERE agent = ?", (document_id,)
                )
                session_ids = [row[0] for row in cur.fetchall()]
                if not session_ids:
                    return {"sessionsDeleted": 0, "messagesDeleted": 0}
                placeholders = ",".join("?" for _ in session_ids)
                messages_deleted = 0
                for table in ("messages", "message_parts", "context_items", "summary_nodes"):
                    cur = conn.execute(
                        f"DELETE FROM {table} WHERE session_id IN ({placeholders})",
                        session_ids,
                    )
                    if table == "messages":
                        messages_deleted = cur.rowcount
                conn.execute(
                    f"DELETE FROM sessions WHERE id IN ({placeholders})", session_ids
                )
                conn.commit()
                return {
                    "sessionsDeleted": len(session_ids),
                    "messagesDeleted": messages_deleted,
                }
            finally:
                conn.close()

        result = await asyncio.to_thread(_purge)
        return result

    async def shutdown(self) -> dict:
        for document_id, session in list(self.sessions.items()):
            try:
                await session.close()
            except Exception as exc:  # best-effort cleanup
                print(f"close({document_id}) failed: {exc}", file=sys.stderr)
        self.sessions.clear()
        return {}


async def handle(worker: Worker, frame: dict) -> dict:
    op = frame.get("op")
    params = frame.get("params") or {}
    if op == "ping":
        return await worker.ping()
    if op == "shutdown":
        return await worker.shutdown()
    if not HAVE_MNESIS:
        raise RuntimeError("mnesis is not installed (see requirements.txt)")
    if op == "record":
        return await worker.record(params)
    if op == "messages":
        return await worker.messages(params)
    if op == "close":
        return await worker.close(params)
    if op == "forget":
        return await worker.forget(params)
    raise RuntimeError(f"unknown op: {op}")


async def main() -> None:
    # Windows Python defaults piped stdio to the ANSI codepage — force UTF-8
    # so non-ASCII document text survives the Electron round-trip.
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    # Mnesis logs via structlog; its default PrintLogger writes to stdout,
    # which would pollute the ndjson protocol stream. Route everything to
    # stderr and keep it at WARNING.
    try:
        import structlog

        structlog.configure(
            wrapper_class=structlog.make_filtering_bound_logger(logging.WARNING),
            logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        )
    except Exception:
        pass
    logging.basicConfig(stream=sys.stderr, level=logging.WARNING)

    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True, help="SQLite database path")
    parser.add_argument("--model", required=False, default="openai/gpt-4o")
    args = parser.parse_args()

    worker = Worker(args.db, args.model)

    # A plain reader thread is portable across Windows proactor and POSIX
    # event loops (connect_read_pipe is not usable with sys.stdin on Windows).
    # `None` is the EOF sentinel: the server keeps serving until every queued
    # frame is answered — never cancel in-flight requests on stdin EOF.
    lines: "asyncio.Queue" = asyncio.Queue()

    async def read_stdin() -> None:
        loop = asyncio.get_running_loop()
        while True:
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:
                await lines.put(None)
                return
            await lines.put(line)

    async def serve() -> None:
        while True:
            line = await lines.get()
            if line is None:
                return  # stdin closed — exit cleanly after draining the queue
            # Strip a UTF-8 BOM: PowerShell 5.1 pipes strings with one
            line = line.lstrip("﻿").strip()
            if not line:
                continue
            try:
                frame = json.loads(line)
            except json.JSONDecodeError as exc:
                print(f"bad frame: {exc}", file=sys.stderr)
                continue

            try:
                result = await handle(worker, frame)
                response = {"id": frame.get("id"), "ok": True, "result": result}
            except Exception as exc:
                response = {"id": frame.get("id"), "ok": False, "error": str(exc)}

            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()

            if frame.get("op") == "shutdown":
                return

    reader = asyncio.create_task(read_stdin())
    server = asyncio.create_task(serve())
    # Serve until shutdown is requested or stdin closes and the queue drains
    await server
    reader.cancel()
    await worker.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
