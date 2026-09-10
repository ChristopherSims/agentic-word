"""
Mnesis worker for Lexicon (memory.md Phase 1 skeleton).

A stdio JSON-RPC sidecar that owns Mnesis sessions for conversation-context
compaction. The Electron main process spawns this with Python and speaks
newline-delimited JSON (ndjson):

  request:  {"id": 1, "op": "record", "params": {...}}\n
  response: {"id": 1, "ok": true, "result": {...}}\n   or
            {"id": 1, "ok": false, "error": "..."}\n

Protocol ops:
  ping     {}                          -> {"mnesis": true|false, "version": str,
                                           "protocol": n, "capabilities": [...]}
  record   {documentId, userMessage,
            assistantResponse,
            tokens?: {input, output}}  -> {sessionId, userMessageId,
                                           assistantMessageId,
                                           compactionTriggered}
  messages {documentId}                -> [{"role", "content"}, ...]
                                           (loads existing history; never
                                           implicitly creates a session)
  load     {documentId, sessionId?}    -> {sessionId, found} (explicit resume)
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
import os
import sys

MNESIS_VERSION = "0.3.0"
PROTOCOL_VERSION = 1

try:
    from mnesis import MnesisSession, MnesisConfig, StoreConfig, TokenUsage  # type: ignore

    HAVE_MNESIS = True
except ImportError:  # graceful degradation — never crash the host
    HAVE_MNESIS = False


def installed_mnesis_version() -> str:
    """Real installed package version (never a hardcoded claim)."""
    try:
        from importlib.metadata import PackageNotFoundError, version

        try:
            return version("mnesis")
        except PackageNotFoundError:
            return "unknown"
    except Exception:
        return "unknown"


class Worker:
    """Owns Mnesis sessions keyed by (database path, documentId).

    Each Lexicon projection generation lives in its own SQLite file
    (updates-2.md §E). A single worker serves several generation databases;
    requests carry an optional `dbPath` and default to the worker's `--db`.
    """

    def __init__(self, db_path: str, model: str):
        self.db_path = db_path
        self.model = model
        # (db_path, document_id) -> MnesisSession
        self.sessions: dict = {}

    def _db_path(self, params: dict) -> str:
        return params.get("dbPath") or self.db_path

    def _config(self, db_path: str) -> "MnesisConfig":
        return MnesisConfig(store=StoreConfig(db_path=db_path))

    async def _session(self, document_id: str, db_path: str) -> "MnesisSession":
        key = (db_path, document_id)
        session = self.sessions.get(key)
        if session is None:
            session = await MnesisSession.create(
                model=self.model,
                # document-addressable: the sessions.agent column records which
                # document owns each session, so forget() can dispose of all of
                # them (memory.md §11 whole-session disposal).
                agent=document_id,
                config=self._config(db_path),
            )
            self.sessions[key] = session
        return session

    def _find_session_id(self, document_id: str, db_path: str) -> "str | None":
        """Stored session id for a document in one database, or None.

        Never guesses "latest": with multiple profiles or conversation resets
        the id is ambiguous and resume must not pick one arbitrarily (R20).
        """
        import sqlite3

        try:
            conn = sqlite3.connect(db_path)
            try:
                rows = conn.execute(
                    "SELECT id FROM sessions WHERE agent = ?", (document_id,)
                ).fetchall()
            finally:
                conn.close()
        except sqlite3.Error:
            return None
        return rows[0][0] if len(rows) == 1 else None

    async def _load_existing(self, document_id: str, db_path: str) -> "MnesisSession | None":
        """Load the document's existing session WITHOUT creating one (R20)."""
        key = (db_path, document_id)
        session = self.sessions.get(key)
        if session is not None:
            return session
        session_id = self._find_session_id(document_id, db_path)
        if session_id is None:
            return None
        session = await MnesisSession.load(session_id, db_path=db_path)
        self.sessions[key] = session
        return session

    async def ping(self) -> dict:
        return {
            "mnesis": HAVE_MNESIS,
            "version": installed_mnesis_version(),
            "protocol": PROTOCOL_VERSION,
            "capabilities": ["record", "messages", "load", "close", "forget", "shutdown"],
            # Upstream compaction may choose its own provider; it stays
            # unavailable until a verified summarization hook routes through the
            # TS gateway (updates-2.md §E).
            "compaction": False,
        }

    async def load(self, params: dict) -> dict:
        """Explicitly resume an existing session (no implicit create)."""
        document_id = params["documentId"]
        db_path = self._db_path(params)
        explicit_id = params.get("sessionId")
        key = (db_path, document_id)
        session = self.sessions.get(key)
        if session is None:
            session_id = explicit_id or self._find_session_id(document_id, db_path)
            if session_id is None:
                return {"sessionId": None, "found": False}
            session = await MnesisSession.load(session_id, db_path=db_path)
            self.sessions[key] = session
        return {"sessionId": getattr(session, "_session_id", None), "found": True}

    async def record(self, params: dict) -> dict:
        db_path = self._db_path(params)
        session = await self._session(params["documentId"], db_path)
        tokens = params.get("tokens")
        result = await session.record(
            user_message=params["userMessage"],
            assistant_response=params["assistantResponse"],
            tokens=TokenUsage(input=tokens["input"], output=tokens["output"])
            if tokens
            else None,
        )
        return {
            "sessionId": getattr(session, "_session_id", None),
            "userMessageId": result.user_message_id,
            "assistantMessageId": result.assistant_message_id,
            "compactionTriggered": result.compaction_triggered,
        }

    async def messages(self, params: dict) -> list:
        session = await self._load_existing(params["documentId"], self._db_path(params))
        if session is None:
            # Reading absent history returns absent history — it must never
            # implicitly create a session (R20).
            return []
        history = await session.messages()
        return [{"role": m.role, "content": m.text_content()} for m in history]

    async def close(self, params: dict) -> dict:
        key = (self._db_path(params), params["documentId"])
        session = self.sessions.pop(key, None)
        if session is not None:
            await session.close()
        return {}

    async def forget(self, params: dict) -> dict:
        """Whole-session disposal for a document in one generation database.

        mnesis 0.3.0 has no per-message deletion API, and its supported
        `soft_delete_session` retains all message rows. True disposal is
        therefore a hard row delete of every session owned by the document
        (sessions.agent = documentId) in that database: messages, parts,
        context items, and summary/compaction nodes go with it, so nothing can
        reappear through summaries or replay.
        """
        document_id = params["documentId"]
        db_path = self._db_path(params)
        key = (db_path, document_id)
        session = self.sessions.pop(key, None)
        if session is not None:
            try:
                await session.close()
            except Exception as exc:  # best-effort — disposal proceeds
                print(f"forget: close({document_id}) failed: {exc}", file=sys.stderr)

        def _purge() -> dict:
            import sqlite3

            conn = sqlite3.connect(db_path)
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
        for (db_path, document_id), session in list(self.sessions.items()):
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
    if op == "load":
        return await worker.load(params)
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
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except Exception:
        pass
    # The stdin reader thread (run_in_executor -> sys.stdin.readline) stays
    # blocked while the parent holds stdin open, which would otherwise keep the
    # process alive at interpreter exit. Force a deterministic exit after the
    # graceful store cleanup above.
    os._exit(0)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
