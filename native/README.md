# Rust Core — Native Addon for Lexicon

Compiled as a napi-rs Node.js native addon (`.node` file) that the Electron main process imports directly.

## Build

```bash
cd native
npm install
npm run build        # Release build
npm run build:debug  # Debug build
```

Or from the project root:
```bash
npm run build:native
```

## Architecture

```
native/src/
├── lib.rs              # napi-rs entry point, all #[napi] exports
├── db.rs               # SQLite connection pool, schema migrations (13 tables)
├── core/               # Foundation: types, errors, config, logging, parallel
├── storage/            # Document I/O, PM JSON converters, VCS engine, encryption
├── search/             # In-memory full-text search index
├── ai/                 # OpenAI-compatible HTTP client, SSE streaming, 18 tools
├── analysis/           # Readability, stats, tone detection, keyword extraction
└── sync/               # Cloud storage, collaboration, OAuth (stubs)
```

## napi API Surface

### Document I/O
- `openDocument(filePath)` → Document
- `saveDocument(filePath, pmJson)` → void

### Format Converters
- `htmlToPm(html)` → ProseMirror JSON
- `pmToHtml(pmJson)` → HTML
- `mdToPm(md)` → ProseMirror JSON
- `pmToMd(pmJson)` → Markdown
- `exportPdf(pmJson, outputPath)` → void

### VCS (16 operations)
- `vcsCommit`, `vcsLog`, `vcsDiff`, `vcsGraph`, `vcsMerge`
- `vcsCreateBranch`, `vcsListBranches`, `vcsSwitchBranch`
- `vcsCreateTag`, `vcsListTags`
- `vcsStashPush`, `vcsStashList`, `vcsStashPop`
- `vcsBlame`, `vcsMigrateFromJson`

### AI Agent
- `agentGetPresets()`, `agentListSessions()`, `agentSaveSession()`
- `agentDeleteSession()`, `agentGetTools()`, `agentBuildMessages()`

### Search
- `searchIndexDocument(docId, title, content)`
- `searchDocuments(query, limit)` → IndexedDoc[]

### Analysis
- `analyzeDocument(pmJson)` → AnalysisResult

### Encryption
- `encryptText(plaintext, password)` → JSON {nonce, ciphertext, salt}
- `decryptText(ciphertext, nonce, salt, password)` → plaintext

### Image Processing
- `processImage(imageData, imageId, maxWidth)` → JSON {webp_path, thumbnail_path, width, height}

## Dependencies

- **napi-rs**: Node.js native addon framework
- **rusqlite**: SQLite with WAL mode, bundled compilation
- **scraper**: HTML parsing for PM converter
- **pulldown-cmark**: Markdown parsing
- **similar**: Line-based diff algorithm
- **reqwest**: HTTP client for AI chat completions (rustls-tls)
- **image**: Image resizing and WebP compression
- **zstd**: Blob compression for VCS storage
- **aes-gcm**: Document encryption
- **lru**: In-memory document cache
- **rayon**: Parallel batch operations
- **uuid**: Unique IDs for commits and documents
