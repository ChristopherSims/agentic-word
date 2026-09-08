# Mnesis worker (Phase 1 skeleton)

Stdio JSON-RPC sidecar that owns [Mnesis](https://github.com/Lucenor/mnesis)
sessions for conversation-context compaction. Spawned by the Electron main
process (`src/main/memory/mnesis-client.ts`) only when the user enables the
feature — it is **off by default** and the app degrades to its normal behavior
when the worker, Python, or the mnesis package is missing (kill switch).

## Protocol

Newline-delimited JSON over the worker's stdin/stdout. Logs go to stderr.

```
-> {"id":1,"op":"ping","params":{}}
<- {"id":1,"ok":true,"result":{"mnesis":true,"version":"0.3.0"}}

-> {"id":2,"op":"record","params":{"documentId":"...","userMessage":"...","assistantResponse":"..."}}
<- {"id":2,"ok":true,"result":{"userMessageId":"...","assistantMessageId":"...","compactionTriggered":false}}

-> {"id":3,"op":"messages","params":{"documentId":"..."}}
<- {"id":3,"ok":true,"result":[{"role":"user","content":"..."}]}

-> {"id":4,"op":"close","params":{"documentId":"..."}}
-> {"id":5,"op":"shutdown","params":{}}

-> {"id":6,"op":"forget","params":{"documentId":"..."}}
<- {"id":6,"ok":true,"result":{"sessionsDeleted":1,"messagesDeleted":4}}
```

`forget` is whole-session disposal (memory.md §11): sessions are created with
`agent=documentId`, so every session a document owns can be hard-deleted
(messages, parts, context items, compaction summaries — `soft_delete_session`
retains rows, which is not a real forget). Sessions from older workers
(`agent='default'`) are not document-addressable and are left alone.

## Local setup (development)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The app locates Python via the `mnesisPythonPath` agent config entry (defaults
to `python` on PATH). The database is stored under the app's userData directory
(`mnesis/sessions.db`), never in `~/.mnesis`.

## Packaging (memory.md §13 — shipping beyond dev machines)

Packaged apps cannot use the repo checkout or read scripts inside ASAR, so
electron-builder ships the worker via `extraResources`:

- `native/mnesis-worker` → `resources/mnesis-worker` (worker.py,
  requirements.txt, README.md)
- `native/mnesis-runtime` → `resources/mnesis-runtime` (optional embeddable
  Python with mnesis installed)

To bundle a runtime on Windows, run before `npm run dist`:

```powershell
powershell -ExecutionPolicy Bypass -File package-runtime.ps1   # downloads embeddable Python 3.12, installs mnesis==0.3.0
npm run dist
```

macOS/Linux has no embeddable distribution — place a standalone Python with
mnesis installed at `native/mnesis-runtime/` (interpreter at
`mnesis-runtime/bin/python3`), or ship without a runtime and rely on system
Python.

Path resolution is handled by `resolveMnesisPaths` in
`src/main/memory/mnesis-client.ts` (pure, unit-tested): packaged builds prefer
`resources/mnesis-runtime`, an explicit `mnesisPythonPath` always wins, and a
missing runtime degrades to system `python`. When no runtime is bundled the
feature remains dev-only in practice; that capability difference is acceptable
per the kill-switch design but should be stated in release notes.

Re-run the smoke test below against the bundled interpreter
(`native\mnesis-runtime\python.exe worker.py`) before shipping a bundle.

## Bundled-runtime smoke test — verified (2026-09-07)

`package-runtime.ps1` produced an embeddable Python 3.12 runtime with
`mnesis==0.3.0` at `native/mnesis-runtime`. The full ndjson round-trip
(ping / record / messages / shutdown) passed against that interpreter with
byte-faithful UTF-8 (`café` / `réponse` intact), exactly matching the
system-Python results below. The spike's final packaging condition — the
sidecar working without a dev venv — is satisfied for the runtime path; what
remains before a release is an actual `npm run dist` bundle check.

## Deletion-flow smoke test — verified (2026-09-08, memory.md §11)

The `forget` op was exercised against the bundled runtime with two documents
sharing one DB: `forget(doc-alpha)` reported `{sessionsDeleted: 1,
messagesDeleted: 4}`, a subsequent `messages(doc-alpha)` returned `[]`, and
`messages(doc-beta)` was untouched. Direct SQLite inspection after disposal:
0 sessions, 0 messages, 0 parts, 0 summary nodes for doc-alpha (a planted
marker phrase no longer exists anywhere in the DB); doc-beta's rows intact.
This is the "prove before release" deletion evidence §11 asked for.

## Windows smoke test — verified (2026-09-07)

Full ndjson round-trip against `mnesis==0.3.0` on Python 3.14 / Windows:

- `pip install -r requirements.txt` succeeds (pulls litellm, tokenizers, etc.).
- `ping` → `{"mnesis": true, "version": "0.3.0"}`.
- `record` → persists the turn, returns message ids, SQLite db created.
- `messages` → returns the recorded turn with **byte-faithful UTF-8**
  (Umlauts/em dashes intact). The worker forces UTF-8 stdio because Windows
  Python otherwise decodes piped stdin as the ANSI codepage.
- `close` / `shutdown` → clean exit.

Findings that shaped the worker:

1. **libmagic is optional for our usage.** `import magic` fails without the
   native DLL, but Mnesis imports it lazily — `MnesisSession`/`record`/`
   `messages` all work without it. Only the large-file (`FileRefPart`) path
   needs libmagic, which this worker never exercises via `record()`. The
   packaging hazard is therefore *lower* than the spike assumed, but still
   blocks the large-file feature if we ever adopt it.
2. **Mnesis's structlog defaults to stdout** — it would pollute the ndjson
   stream. The worker reconfigures structlog to stderr at WARNING.
3. **stdin EOF must not cancel in-flight requests.** The worker drains its
   queue before exiting and strips a UTF-8 BOM (PowerShell pipes one).

## Dist bundle validation — verified (2026-09-08, memory.md §13 complete)

A real `npm run dist` (Windows x64, electron-builder 41, NSIS + portable)
succeeded end-to-end with the bundled runtime. Results:

- `dist/lexicon-0.6.8-setup.exe` (182 MB) and `dist/lexicon-0.6.8-portable.exe`
  (182 MB) built and signed; the build log confirms every
  `resources/mnesis-runtime/python*.exe` and scripts entry is signed too.
- `dist/win-unpacked/resources/mnesis-worker/` contains exactly
  worker.py, requirements.txt, README.md — matches `resolveMnesisPaths`
  expectations.
- `dist/win-unpacked/resources/mnesis-runtime/python.exe` exists and is the
  bundled embeddable interpreter.
- **Zero `mnesis` entries inside `app.asar`** (`npx asar list` — the worker
  and runtime are extraResources only, as required since ASAR would be
  unreadable to a spawned Python process).
- **Packaged-layout smoke test passed**: piping the ndjson round-trip
  (ping / record / messages / shutdown) through
  `resources/mnesis-runtime/python.exe resources/mnesis-worker/worker.py`
  returned the recorded turn with byte-faithful UTF-8 (`é`, `ö`, `—`, `✓`
  intact). Note for anyone re-running this by hand: PowerShell 5.1 pipes to
  native processes in ASCII by default and will mangle non-ASCII input before
  Python sees it — redirect from a UTF-8 file (`cmd /c "python.exe worker.py
  --db < frames"`) to test the worker itself, as the app's spawn always passes
  UTF-8 bytes.

The one prior gap ("what remains before a release is an actual
`npm run dist` bundle check") is closed. Known limitations, unchanged: no
macOS/Linux embeddable runtime (system Python fallback), and libmagic remains
optional (unused by `record`/`messages`).

## Packaging status

Wired into electron-builder (see "Packaging" above) and validated by a real
dist run. Remaining before a public release: macOS/Linux runtime strategy
and release-notes wording for the dev-vs-packaged capability difference.
