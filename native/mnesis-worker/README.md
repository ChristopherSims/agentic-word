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
```

## Local setup (development)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The app locates Python via the `mnesisPythonPath` agent config entry (defaults
to `python` on PATH). The database is stored under the app's userData directory
(`mnesis/sessions.db`), never in `~/.mnesis`.

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

## Packaging status

NOT yet wired into electron-builder. Before a packaged release can ship this:

1. Bundle a Python 3.12+ runtime and this directory as extra resources.
2. Resolve the `python-magic`/libmagic Windows dependency (see requirements.txt).
3. Re-run the Windows smoke test (SQLite WAL + spawn) against the bundle.

Until then the feature remains a dev-only experiment behind the Memory panel
toggle.
