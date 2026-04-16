# Agentic Word

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/ChristopherSims/agentic-word)](https://github.com/ChristopherSims/agentic-word/releases)

A native desktop DOCX editor with git-like version control, AI agent integration, real-time collaboration, and a plugin ecosystem. Built with Electron, React, TypeScript, and TipTap.

## Features

- **Rich Document Editing** — Full WYSIWYG with TipTap: headings, lists, tables, images, links, footnotes, page breaks, alignment, font family/size/color
- **Git-like Version Control** — Commits, branches, merge with conflict detection, tags, cherry-pick, interactive rebase (squash/reorder/edit), blame view, stash, patch export/import, DAG graph, VCS hooks
- **AI Agent Integration** — Persistent per-document sessions, multi-agent (Writer + Reviewer), web search, outline generation, summarization, translation, inline Copilot-style suggestions (Tab to accept)
- **Real-Time Collaboration** — Yjs CRDT over WebSocket, shared cursors with colored indicators, room codes, presence awareness
- **Document Intelligence** — Inline version diff, table of contents, print preview with headers/footers, comment threads, track changes, autocorrect (typos, smart quotes, em-dash)
- **Plugin Ecosystem** — Sandboxed runtime, 5 lifecycle hooks, per-permission API, built-in marketplace (word frequency, Pomodoro timer, MD paste sanitizer)
- **Export** — DOCX, HTML, Markdown, PDF, EPUB
- **Themes** — Catppuccin Mocha/Latte, Dracula, Nord, Solarized Dark/Light with custom accent colors

## Quick Start

```bash
npm install
npm run dev     # Development
npm run build   # Production build
```

## Architecture

```
src/
  main/           — Electron main process
    index.ts         Window, menu, IPC handlers, auto-save, plugins
    agent-bridge.ts  AI agent with 17 tools, SSE streaming, multi-turn chains
    vcs-engine.ts    Git-like VCS: commits, branches, merge, tags, rebase, stash, blame
    document-store.ts  DOCX/HTML/MD import/export, templates
    plugin-engine.ts   Plugin sandbox, hooks, marketplace
  preload/         — contextBridge API (vcs, agent, file, plugin, collab, settings)
  renderer/        — React UI
    App.tsx           Root with ThemeProvider, IPC listeners
    components/       EditorPanel, Toolbar, AgentWorkspacePanel, VcsPanel,
                      SettingsPanel, CommentPanel, PrintPreview, etc.
    store/            Zustand app store
    extensions.ts     Custom TipTap extensions (PageBreak, Autocorrect, CommentMark, InlineSuggestion)
    collab-client.ts  Yjs WebSocket client with awareness
    ThemeProvider.tsx  MUI palette sync with 6 themes
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+N | New document |
| Ctrl+O | Open file |
| Ctrl+S | Save |
| Ctrl+F | Find & Replace |
| Ctrl+T | New tab |
| Ctrl+\\ | Split view |
| Ctrl+, | Settings |
| Ctrl+Enter | Page break |
| Ctrl+Shift+M | Add comment |
| Ctrl+Shift+E | AI inline edit |
| Ctrl+Shift+P | Command palette |

## License

[MIT](LICENSE) — Copyright (c) 2026, Christopher Sims and Contributors
