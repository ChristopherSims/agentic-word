# Changelog

All notable changes to **Agentic Word** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-04-13

### Changed

- **Toolbar spacing improved** — New, Open, and Save buttons now use labeled SVG icons with wider spacing and distinct bordered styling, making file operations clearly separated from formatting tools

### Added

- **Inline diff review for AI agent changes** — When the AI agent proposes document modifications (replace, insert, delete, format), they are no longer applied immediately. Instead, each change appears as a pending diff that the user must explicitly accept or reject:
  - Word-level inline diff display with red strikethrough for removed text and green highlight for added text
  - Accept (Enter) / Reject (Escape) keyboard shortcuts
  - Accept All / Reject All buttons for bulk operations
  - Prev / Next navigation across multiple pending changes
  - Editor dims while pending changes exist to draw attention to the diff overlay
  - Pulsing "pending" badge in toolbar shows count of unreviewed changes
  - Chat sidebar now informs users that changes require review instead of auto-applying

## [0.1.0] - 2026-04-13

### Added

- Initial release of **Agentic Word** — a native desktop DOCX editor
- **Rich text editor** powered by TipTap/ProseMirror with bold, italic, underline, strikethrough, headings (H1–H3), bullet/ordered lists, blockquotes, tables, images, links, horizontal rules, and code blocks
- **DOCX import/export** via mammoth.js (import) and the `docx` npm package (export), plus HTML, Markdown, and plain text support
- **Git-like version control** built into the editor — commit snapshots with messages, view history log, diff between versions, create and switch branches, revert to any prior commit. Data persisted to `.wordapp-vcs/vcs.json`
- **AI chat sidebar** — talk to an AI agent to edit the document via natural language. Agent can call tools to modify content and manage version control
- **Hermes Agent compatibility** — ACP-compatible tool interface exposing 11 document and VCS tools. Works with any OpenAI-compatible API endpoint (Ollama, OpenAI, Hermes, OpenRouter, etc.)
- **Extensible tool plugin system** — register custom tools that the AI agent can discover and execute
- **Agent configuration modal** — configure API endpoint, key, and model name
- **Catppuccin Mocha dark theme** throughout the UI
- **Electron + React + TypeScript** stack with electron-vite build tooling and electron-builder packaging
