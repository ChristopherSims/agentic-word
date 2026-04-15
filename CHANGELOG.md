# Changelog

All notable changes to **Agentic Word** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-04-15

### Added

- **Material UI integration** — Replaced all hand-rolled CSS components with MUI (Material UI) components across the entire app. Installed `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`
- **MUI ThemeProvider** — New `ThemeProvider` component syncs with existing theme system (Catppuccin Mocha/Latte, Dracula, Nord, Solarized). Automatically generates MUI palette from custom theme vars. Accent color, dark/light mode, and typography all sync
- **MUI Toolbar** — Replaced hand-rolled buttons with `IconButton`, `ToggleButtonGroup`, `Select`, `Tooltip`, `Divider`, `Chip`. SVG icons from `@mui/icons-material` for all formatting, alignment, insert, VCS, and view actions
- **MUI Tabs** — `TabBar` rewritten with MUI `Tabs`, `Tab`, scrollable variant, proper dirty indicator with `FiberManualRecordIcon`
- **MUI ChatSidebar** — `Paper`, `TextField`, `Button`, `Chip`, `Typography`, `Box`. Message bubbles with `bgcolor` based on role. Smart suggestions with MUI `Button`, `Chip`, `IconButton`
- **MUI SettingsPanel** — Full rewrite with MUI `Tabs`, `Slider`, `Switch`, `TextField`, `Select`, `Chip`, `Avatar` (for accent swatches), `Table` (for keybindings), `List/ListItem`. 6 tabs preserved
- **MUI ToastContainer** — Replaced with MUI `Snackbar` + `Alert` (filled variant, severity-based colors)
- **MUI CommandPalette** — Rewritten with MUI `Dialog` + `Autocomplete` with `groupBy` for categories
- **MUI InlineEditModal** — Rewritten with MUI `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `TextField`
- **MUI DocStatsPanel** — `Paper`, `Table/TableRow/TableCell`, `Chip` for grade level, `Divider`
- **MUI OutlinePanel** — `Paper`, `List/ListItemButton`, `Chip` for heading level badges
- **CssBaseline** — MUI `CssBaseline` provides consistent baseline styles alongside existing TipTap/editor CSS

### Changed

- All toolbar buttons now use MUI icon components instead of Unicode/emoji symbols
- Theme switching now updates MUI palette in real-time (primary, secondary, background, text, success/warning/error colors)
- `App.tsx` wraps entire render in `<ThemeProvider>` instead of bare `<>`
- Removed floating sidebar toggle button (ChatSidebar handles its own visibility)
- Editor-specific CSS (TipTap, diff, merge, collab cursors, footnotes) preserved alongside MUI
- VcsPanel partially MUI-ified (container, tabs, inputs) while keeping custom graph/diff/merge rendering
- Chat sidebar header sticky with z-index 150 so close button stays visible when settings panel overlaps; added explicit close-sidebar button (chevron-right)
- Fixed FootnoteRefView node view — wraps content in `<NodeViewWrapper>` per TipTap API (was crashing React with null useState)

## [0.2.7] - 2026-04-15

### Added

- **Outline view** — Extracts H1/H2/H3 headings from document into a clickable table of contents sidebar. Click to scroll to heading. Auto-updates as you type. Toggle via toolbar (☰) or command palette
- **AI inline editing** — Select text, press Ctrl+Shift+E, type a natural language instruction (e.g. "make this more formal"). Agent edits only the selection, result shown as a pending diff for review. `InlineEditModal` component
- **Smart suggestions** — 💡 button in chat sidebar triggers agent analysis of document. Returns categorized suggestions (grammar/style/structure) with context quotes. Non-streaming request with temperature 0.3. Refresh/clear controls
- **Document statistics panel** — Readability score (Flesch-Kincaid Grade Level), average sentence length, paragraph count, sentence count, syllable count, reading time estimate. Color-coded grade indicator (easy/standard/difficult). Toggle via toolbar (📊) or command palette. `doc-stats` IPC handler computes on main process
- **Footnotes/endnotes** — TipTap custom `FootnoteReference` node (inline superscript with click-to-scroll) and `FootnoteContent` block node. Ctrl+Shift+F inserts footnote. `FootnotesSection` renders editable footnote content at document bottom. Toolbar button ⁿ

## [0.2.6] - 2026-04-15

### Added

- **Settings → Backend wiring** — Agent temperature and max tool turns now sent to agent-bridge via IPC on change. Spell check language sent to `session.setSpellCheckerLanguages()`. Default font family/size applied to new documents. VCS auto-commit on save triggers a VCS commit before file save. New IPC handlers: `agent-configure-advanced`, `agent-get-advanced`, `set-spellcheck-lang`, `vcs-auto-commit`, `vcs-prune-commits`
- **Table editing toolbar** — When cursor is inside a table, 7 context buttons appear: Add Row Before, Add Row After, Add Column Before, Add Column After, Delete Row, Delete Column, Delete Table
- **Image upload from disk** — New "Insert Image from Disk" button (🖼) opens a file picker filtered to images, embeds the selected file as a base64 data URI. Original URL-prompt button now labeled 🖼ℹ
- **Notification toasts** — Success/error toasts for: file save, file save-as, PDF export, markdown export, EPUB export, template save, VCS commit, VCS merge (with conflict count), auto-commit. Error toasts for failed operations
- **Focus / Zen mode** — Toggle via command palette hides toolbar, tab bar, footer — just the document. Escape exits focus mode. Centered content at max-width 720px with larger font and line-height

### Changed

- `agent-bridge.ts` now supports `configureAdvanced()` and `configureAdvanced()` IPC for temperature/maxToolTurns. Temperature sent in all 3 request payloads (initial stream, multi-turn follow-up, non-streaming)
- `EditorPanel.handleSave()` now checks `vcsAutoCommitOnSave` setting and triggers VCS commit before file save
- `EditorPanel.handleNew()` applies `defaultFontFamily` and `defaultFontSize` to new document content
- `SettingsPanel` now sends `agentMaxToolTurns`, `agentTemperature`, and `spellCheckLang` to backend via `useEffect`
- Preload bridge expanded with full type declarations for all IPC methods

### Removed

- **AgentConfigModal.tsx** — Deleted. Was never imported after being replaced by SettingsPanel in v0.2.4

## [0.2.5] - 2026-04-15

### Added

- **Auto-update** — Checks GitHub Releases API on startup for new versions. If a newer version exists, shows a green badge in the bottom-left corner with version number and link to the release page. `check-for-updates` IPC handler fetches from `api.github.com`
- **Recent files list** — Tracks last 10 opened files in `userData/recent-files.json`. Shown in File > Recent Files submenu. Clicking opens the file. `recent-files` and `recent-files-clear` IPC handlers
- **Tabbed documents** — Open multiple documents in browser-style tabs. New Tab button (+), Ctrl+T shortcut, close buttons on each tab (except last). Tab state (title, path, content, dirty flag) tracked in Zustand store. `addDocTab`, `switchDocTab`, `closeDocTab`, `updateDocTab` actions
- **Drag-and-drop file open** — Drop .docx/.html/.md files onto the window to open them. `webContents.file-drop` listener in main process sends `file-opened` event and adds to recent files
- **Split editor view** — Ctrl+\ toggles side-by-side view: Editor on left, read-only preview on right with synced scrolling. Split divider between panes. `toggle-split-view` IPC event
- **Custom template builder** — File > Save as Template prompts for a name and saves the current document as a custom template. Stored in `userData/custom-templates/` as HTML files. Appears alongside built-in templates in File > New from Template. `custom-template-save/list/get/delete` IPC handlers
- **Export to EPUB** — File > Export EPUB opens a save dialog. Generates a minimal valid EPUB 3.0 ZIP with container.xml, content.opf, nav.xhtml, and chapter XHTML files. Uses `adm-zip` if available, falls back to raw HTML with warning toast. `export-epub` IPC handler
- **Markdown live preview** — Toggle via command palette. When a .md file is open, renders the markdown as HTML in a side panel (like the chat sidebar). Auto-updates on content change. `markdown-to-html` IPC handler reuses `DocumentStore.markdownToHtml()` (now public). `MdPreview` component
- **Toast notifications** — Auto-dismissing success/error/warning/info toasts in bottom-right corner. Appear for save, export, template save events. 4-second auto-dismiss with click-to-dismiss. `addToast`/`removeToast` store actions
- **New toolbar commands** — Ctrl+T (new tab), Ctrl+\ (toggle split view) keyboard shortcuts. Command palette entries for Split View and Markdown Preview toggles

### Changed

- `DocumentStore.markdownToHtml()` changed from `private` to `public` for IPC access
- File > Open dialog now includes `.epub` in supported extensions
- File menu adds Recent Files submenu, Save as Template, Export EPUB
- View menu adds Toggle Split View (Ctrl+\\)
- `app-layout` now includes `MdPreview` panel alongside `ChatSidebar`
- File-opened events now call `addRecentFile()` to track recently opened files
- `buildMenu()` is now `rebuildable` via `rebuildMenu()` for dynamic recent files

## [0.2.4] - 2026-04-15

### Added

- **Settings panel** — Tabbed slide-out panel (like VCS panel) accessed via ⚙ toolbar button or Ctrl+,. Replaces the old AgentConfigModal — agent config is now one tab inside settings
- **6 themes** — Catppuccin Mocha (default), Catppuccin Latte (light), Dracula, Nord, Solarized Dark, Solarized Light. Each defines 12 CSS variables. Applies instantly via `document.documentElement.style.setProperty()`. Persists to localStorage
- **Accent color picker** — Override `--accent` with 6 preset swatches (Blue, Green, Pink, Peach, Teal, Mauve) or custom color via `<input type="color">`. Reverts to theme default when deselected
- **UI font size** — Global scale slider (12px–18px) applied to `html { font-size }`
- **Editor font** — Monospace font selector: Cascadia Code, Fira Code, JetBrains Mono, Source Code Pro, Consolas, Monaco
- **Agent settings tab** — Absorbs old AgentConfigModal content (endpoint, API key, model, presets). Adds max tool chain turns slider (1–10), auto-apply threshold (0–100%, 0 = always review), temperature slider (0.0–2.0)
- **Editor settings tab** — Auto-save interval selector (10s/30s/1min/2min/Off), spell check language dropdown (10 languages + Off), default font family/size for new documents, line spacing (1.0/1.15/1.5/2.0), show word count toggle
- **VCS settings tab** — Default branch name, auto-commit on save toggle, max commits retained (0 = unlimited)
- **Collaboration settings tab** — Display name for collab cursors, cursor color picker, MCP server port (for future WebSocket collab)
- **Keybindings settings tab** — Read-only table of current keyboard shortcuts. Placeholder for customizable bindings in v0.3.0+

### Changed

- AgentConfigModal removed — replaced by Settings > Agent tab
- ⚙ toolbar button now opens Settings panel instead of agent config modal
- Command palette includes "Settings..." entry with Ctrl+, shortcut
- EditorPanel adds Ctrl+, keyboard shortcut to toggle settings

## [0.2.3] - 2026-04-15

### Added

- **PDF export** — Save As now includes PDF format. File > Export PDF (Ctrl+Shift+E) opens a save dialog and generates PDF via Electron's `printToPDF`. Also available via command palette and `export-pdf` IPC
- **Markdown export** — File > Export Markdown opens a save dialog. HTML-to-Markdown converter strips tags, converts headings/bold/italic/lists/links/images/blockquotes/code/hr to MD syntax, decodes HTML entities. Also available via `export-markdown` IPC handler
- **Document templates** — File > New from Template opens a template picker with 5 built-in templates: Blank, Letter, Resume, Report, Memo. Templates contain pre-structured HTML with date placeholders. Accessible from command palette or menu. `template-list` and `template-get` IPC handlers
- **MCP server mode** — Standalone stdio JSON-RPC 2.0 server (`mcp-server.js`) that exposes document tools via Model Context Protocol. Implements `initialize`, `tools/list`, `tools/call` methods. Supports document read/replace/insert/format/delete and scratchpad tools. VCS tools return informational message (requires Electron runtime). Compatible with Claude Desktop, Cursor, and any MCP client
- **Command palette** — Ctrl+Shift+P opens a fuzzy-search modal with 24 commands across File, Edit, View, VCS, Agent, and Tools categories. Shows keyboard shortcuts. Arrow-key navigation, Enter to execute, Escape to close. Categories: New from Template variants, Save/Save As, Export PDF, Find/Replace, Toggle Sidebar/VCS, VCS panel views, Agent config/undo/scratchpad

### Changed

- Save As dialog now includes Markdown and PDF format options in the file type filter
- File menu expanded with "New from Template..." and "Export Markdown..." entries
- Edit menu includes "Command Palette..." with Ctrl+Shift+P accelerator
- `document-store.ts` now has `htmlToMarkdown()` method and `getTemplate()`/`listTemplates()` methods
- `DocumentStore.saveFile()` recognizes `.md` extension and converts HTML to Markdown before writing
- Preload bridge adds `saveAsDialog`, `exportPdf`, `exportMarkdown`, `template.list`, `template.get` methods

## [0.2.2] - 2026-04-14

### Added

- **Streaming responses** — Agent chat now uses SSE streaming (OpenAI-compatible `stream: true`). Tokens appear in real-time in the chat sidebar with an animated cursor. Abort button (red Stop) to cancel mid-stream. Falls back to non-streaming if SSE not supported
- **Multi-turn tool chains** — After the agent calls tools, tool results are sent back to the model automatically (up to 5 turns). The agent can chain: call tool → read result → call another tool → respond. Each follow-up streams back to the user
- **Context-aware agent** — The system prompt now includes the current document content (up to 4000 chars), current VCS branch name, and user's selection. The agent knows what you're looking at without needing `document_read` first
- **Agent presets** — Save, apply, and delete named configuration presets (endpoint + API key + model). Accessible from the Agent Configuration modal. Quick-switch between Ollama, OpenAI, Hermes, etc.
- **Undo agent action** — ↩ button in chat header reverts the most recently accepted pending change. Works by restoring `contentBefore` from the accepted `PendingChange`
- **Agent scratchpad** — Private notes area the agent can read/write via `scratchpad_write` and `scratchpad_read` tools. Also editable manually via 📝 button in chat header. Scratchpad content is included in the agent's system prompt for persistent context across conversations
- **Live collaborative cursors** — Mock cursor presence system via `collab-cursor-update` IPC events. Shows other users' cursor positions as colored dots with names in the editor overlay. Cursor indicators in the chat sidebar header. Infrastructure ready for real multiplayer via WebSocket/CRDT

### Changed

- ChatSidebar rewritten for streaming: creates placeholder message, updates in-place as tokens arrive, shows Stop button during streaming
- Agent bridge now requires `BrowserWindow` reference via `setMainWindow()` for IPC streaming events
- `handleChatStream()` is fire-and-forget from IPC — results come back via `agent-stream-token`, `agent-stream-done`, `agent-stream-error`, `agent-tool-results` events
- Preload bridge expanded with `chatStream`, `abort`, `getPresets`, `addPreset`, `deletePreset`, `applyPreset`, `getScratchpad`, `setScratchpad` methods
- Agent tool registry now includes `scratchpad_write` and `scratchpad_read` tools (13 total)
- `PendingChange.status` type expanded to include `'undone'` state

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
