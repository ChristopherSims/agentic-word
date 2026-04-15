# Changelog

All notable changes to **Agentic Word** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-04-14

### Added

- **Branch merge with conflict UI** — Merge any branch into the current branch. Three-way conflict detection (base/ours/theirs) with visual conflict resolution: keep ours or keep theirs per conflict. Merge commits support multi-parent DAG
- **Visual commit graph** — Node-based DAG view showing all commits with branch head indicators, tag badges, and merge markers. Cherry-pick button on each node
- **Side-by-side diff** — Toggle between inline diff (classic) and side-by-side diff view showing before/after panes with line numbers and color-coded changes
- **Cherry-pick commits** — Pick any commit from any branch onto the current branch. Accessible from the log view and graph view with a cherry-pick button
- **Tag support** — Create named tags on any commit, delete tags, view all tags in a dedicated panel. Tags appear as badges in the commit log and graph views
- **Per-document VCS storage** — VCS data is stored in a `.wordapp-vcs` folder relative to the opened document, so each document has its own independent version history
- **Branch deletion** — Delete branches (except main and current) from the branches panel
- **All-commits view** — VCS engine can enumerate all commits across all branches for graph rendering

### Changed

- VCS engine `Commit` type now uses `parents: string[]` (array) instead of `parent: string | null` to support merge commits
- VCS diff now returns `fromContent` and `toContent` fields for side-by-side rendering
- VCS panel tab bar expanded with Graph, Merge, and Tags views
- VCS engine persistence now includes tags data alongside commits and branches
- Existing VCS data is auto-migrated on load: single `parent` field converted to `parents` array, `tags` array added

## [0.2.0] - 2026-04-14

### Added

- **Spell check** — Electron's built-in spellchecker enabled by default with `en-US` dictionary. Misspelled words are underlined in the editor; right-click for dictionary suggestions and "Add to Dictionary". Toggle spell check on/off from the View menu
- **Find & Replace bar** (Ctrl+F / Ctrl+H) — in-document search with result count and navigation (next/prev). Supports case-sensitive toggle and regex mode. Replace single or replace all. Close with Escape
- **Word count & character count** — displayed in the editor footer status bar, updates in real time as you type
- **Auto-save** — configurable auto-save (default 30s interval) writes to disk when the document is dirty and has a file path. Never lose work. Triggered via IPC from the main process
- **Font family & size controls** — dropdown selectors in the toolbar for font family (10 common fonts) and font size (8px–72px). Uses TipTap TextStyle extension with custom FontFamily and FontSize attributes
- **Text color & highlight color pickers** — native `<input type="color">` pickers in the toolbar for text color and highlight/background color. Supports multicolor highlights
- **Text alignment** — left, center, right, and justify alignment buttons in the toolbar. Works on headings and paragraphs via TipTap TextAlign extension
- **Print support** — Print... (Ctrl+P) opens the system print dialog. Export PDF... saves to PDF via Electron's `printToPDF` API
- **File save IPC** — `docx-save` IPC handler now writes files to disk via the DocumentStore. Save button actually persists the document

### Changed

- Save button now triggers actual file write to disk instead of just clearing the dirty flag
- Editor footer now shows three sections: document title | word/char count | file path + branch
- Toolbar gains Find/Replace toggle button (magnifying glass icon)
- View menu includes spell check toggle checkbox

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
