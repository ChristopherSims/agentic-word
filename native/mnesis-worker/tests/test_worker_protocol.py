"""Worker protocol contract tests (updates-2.md §E).

Runnable with the bundled venv:

    native/mnesis-worker/.venv/Scripts/python.exe -m unittest discover native/mnesis-worker/tests

Covers resume-without-new-session, absent history, explicit load, disposal and
the real installed version — no network/provider calls.
"""

import asyncio
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from worker import Worker, PROTOCOL_VERSION, installed_mnesis_version  # noqa: E402


def run(coro):
    return asyncio.run(coro)


class WorkerProtocolTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="mnesis-contract-")
        self.db = os.path.join(self.tmp, "sessions.db")
        self.worker = Worker(self.db, "openai/gpt-4o")

    def _session_count(self):
        if not os.path.exists(self.db):
            return 0
        conn = sqlite3.connect(self.db)
        try:
            return conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
        except sqlite3.OperationalError:
            return 0  # database created but never initialized by mnesis
        finally:
            conn.close()

    def test_ping_reports_real_version_and_protocol(self):
        pong = run(self.worker.ping())
        self.assertTrue(pong["mnesis"])
        self.assertEqual(pong["protocol"], PROTOCOL_VERSION)
        self.assertIn("load", pong["capabilities"])
        # The version is read from the installed package, not hardcoded.
        self.assertEqual(pong["version"], installed_mnesis_version())

    def test_resume_after_restart_does_not_create_extra_sessions(self):
        recorded = run(
            self.worker.record(
                {"documentId": "doc-a", "userMessage": "hello", "assistantResponse": "world"}
            )
        )
        self.assertTrue(recorded.get("sessionId"))
        self.assertEqual(self._session_count(), 1)

        # Simulate a restart: a fresh Worker over the same database.
        restarted = Worker(self.db, "openai/gpt-4o")
        history = run(restarted.messages({"documentId": "doc-a"}))
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["role"], "user")
        self.assertEqual(history[0]["content"], "hello")
        # Reading history must not have created a second session.
        self.assertEqual(self._session_count(), 1)

        resumed = run(restarted.load({"documentId": "doc-a"}))
        self.assertTrue(resumed["found"])
        self.assertEqual(resumed["sessionId"], recorded["sessionId"])

    def test_absent_history_is_absent_and_creates_nothing(self):
        restarted = Worker(self.db, "openai/gpt-4o")
        self.assertEqual(run(restarted.messages({"documentId": "missing"})), [])
        self.assertFalse(run(restarted.load({"documentId": "missing"}))["found"])
        self.assertEqual(self._session_count(), 0)

    def test_forget_disposes_the_document_sessions(self):
        run(self.worker.record({"documentId": "doc-a", "userMessage": "a", "assistantResponse": "b"}))
        result = run(self.worker.forget({"documentId": "doc-a"}))
        self.assertEqual(result["sessionsDeleted"], 1)
        self.assertEqual(self._session_count(), 0)

    def test_sessions_lists_ids_and_agents_read_only(self):
        run(self.worker.record({"documentId": "doc-a", "userMessage": "a", "assistantResponse": "b"}))
        run(self.worker.record({"documentId": "doc-b", "userMessage": "c", "assistantResponse": "d"}))
        listed = run(self.worker.list_sessions({}))
        self.assertEqual({s["agent"] for s in listed}, {"doc-a", "doc-b"})
        self.assertTrue(all(s["sessionId"] for s in listed))
        # Listing must not create or alter anything.
        self.assertEqual(self._session_count(), 2)

    def test_sessions_on_absent_database_is_empty(self):
        self.assertEqual(run(self.worker.list_sessions({})), [])

    def test_purge_disposes_only_named_sessions(self):
        a = run(self.worker.record({"documentId": "doc-a", "userMessage": "a", "assistantResponse": "b"}))
        run(self.worker.record({"documentId": "doc-b", "userMessage": "c", "assistantResponse": "d"}))
        result = run(self.worker.purge({"sessionIds": [a["sessionId"]]}))
        self.assertEqual(result["sessionsDeleted"], 1)
        remaining = run(self.worker.list_sessions({}))
        self.assertEqual([s["agent"] for s in remaining], ["doc-b"])
        # An empty list is a no-op — never a whole-store purge by omission.
        self.assertEqual(run(self.worker.purge({"sessionIds": []})), {"sessionsDeleted": 0, "messagesDeleted": 0})

    def test_generation_databases_are_isolated(self):
        db_a = os.path.join(self.tmp, "gen-a.db")
        db_b = os.path.join(self.tmp, "gen-b.db")
        worker = Worker(self.db, "openai/gpt-4o")
        run(worker.record({"documentId": "doc-a", "userMessage": "a", "assistantResponse": "b", "dbPath": db_a}))
        run(worker.record({"documentId": "doc-a", "userMessage": "c", "assistantResponse": "d", "dbPath": db_b}))

        self.assertEqual(len(run(worker.messages({"documentId": "doc-a", "dbPath": db_a}))), 2)
        self.assertEqual(len(run(worker.messages({"documentId": "doc-a", "dbPath": db_b}))), 2)

        # Disposing one generation leaves the other untouched.
        run(worker.forget({"documentId": "doc-a", "dbPath": db_a}))
        self.assertEqual(run(worker.messages({"documentId": "doc-a", "dbPath": db_a})), [])
        self.assertEqual(len(run(worker.messages({"documentId": "doc-a", "dbPath": db_b}))), 2)
        run(worker.shutdown())

    def test_session_ids_are_scoped_per_database(self):
        db_a = os.path.join(self.tmp, "gen-a.db")
        db_b = os.path.join(self.tmp, "gen-b.db")
        worker = Worker(self.db, "openai/gpt-4o")
        a = run(worker.record({"documentId": "doc-a", "userMessage": "a", "assistantResponse": "b", "dbPath": db_a}))
        b = run(worker.record({"documentId": "doc-a", "userMessage": "c", "assistantResponse": "d", "dbPath": db_b}))
        self.assertNotEqual(a["sessionId"], b["sessionId"])
        # Resuming each generation returns its own session.
        self.assertEqual(run(worker.load({"documentId": "doc-a", "dbPath": db_a}))["sessionId"], a["sessionId"])
        self.assertEqual(run(worker.load({"documentId": "doc-a", "dbPath": db_b}))["sessionId"], b["sessionId"])
        run(worker.shutdown())

    def test_exits_on_shutdown_while_stdin_stays_open(self):
        worker_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "worker.py"
        )
        db = os.path.join(self.tmp, "proc.db")
        proc = subprocess.Popen(
            [sys.executable, worker_path, "--db", db, "--model", "openai/gpt-4o"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
        )
        try:
            def send(op):
                proc.stdin.write(json.dumps({"id": 1, "op": op, "params": {}}) + "\n")
                proc.stdin.flush()
                return json.loads(proc.stdout.readline())

            pong = send("ping")
            self.assertTrue(pong["ok"])
            self.assertTrue(pong["result"]["mnesis"])
            send("shutdown")
            # stdin is intentionally left open; the worker must still exit.
            proc.wait(timeout=10)
            self.assertEqual(proc.returncode, 0)
        finally:
            if proc.poll() is None:
                proc.kill()


if __name__ == "__main__":
    # mnesis leaves background async resources that can keep the interpreter
    # alive after the tests finish; force a clean, result-coded exit.
    _program = unittest.main(exit=False)
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0 if _program.result.wasSuccessful() else 1)
