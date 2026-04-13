# Agentic Word

A native desktop DOCX editor with built-in git-like version control and an AI agent that edits your documents through natural conversation. Compatible with [Hermes Agent](https://github.com/NousResearch/hermes-agent).

## Features

- **Rich Document Editing** — Full-featured editor powered by TipTap/ProseMirror with bold, italic, underline, headings, lists, tables, images, links, blockquotes, and more
- **DOCX Import/Export** — Open `.docx` files via mammoth.js, save back to `.docx` via the `docx` package. Also supports `.html`, `.md`, and `.txt`
- **Git-like Version Control** — Commit snapshots, view history, diff between versions, create branches, switch branches, and revert to any prior commit — all built into the editor
- **AI Chat Sidebar** — Talk to an AI agent that can directly edit your document using tools: replace text, insert content, apply formatting, delete sections, and manage version control
- **Hermes Agent Compatible** — Exposes an ACP-compatible tool interface with 11 document and VCS tools. Works with any OpenAI-compatible API endpoint (Ollama, OpenAI, Hermes, OpenRouter, etc.)
- **Plugin Tool System** — Extensible tool registry — register custom tools that the AI agent can discover and execute

## Screenshots

*Coming soon*

## Quick Start

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
git clone https://github.com/simswebdev/agentic-word.git
cd agentic-word
npm install
```

### Run in Development

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Package as Desktop App

```bash
npx electron-builder
```

## Architecture

```
agentic-word/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # App entry, windows, menus, IPC handlers
│   │   ├── document-store.ts    # File I/O, DOCX import/export
│   │   ├── vcs-engine.ts       # Git-like version control engine
│   │   └── agent-bridge.ts      # AI agent bridge + tool registry
│   ├── preload/
│   │   └── index.ts             # contextBridge API exposure
│   └── renderer/                # React frontend
│       ├── App.tsx               # Root component + IPC listeners
│       ├── components/
│       │   ├── EditorPanel.tsx   # TipTap rich text editor
│       │   ├── Toolbar.tsx       # Formatting & file toolbar
│       │   ├── ChatSidebar.tsx   # AI chat with tool execution
│       │   ├── VcsPanel.tsx      # Version control panel
│       │   └── AgentConfigModal.tsx
│       ├── store/
│       │   └── app-store.ts     # Zustand global state
│       └── styles/
│           └── global.css       # Catppuccin Mocha dark theme
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

## AI Agent Tools

The agent bridge exposes 11 tools in an OpenAI function-calling format:

### Document Tools

| Tool | Description |
|------|-------------|
| `document_read` | Read current document content |
| `document_replace` | Find & replace text (with regex support) |
| `document_insert` | Insert content at start, end, or cursor position |
| `document_format` | Apply bold, italic, heading, list formatting |
| `document_delete` | Find and delete text from the document |

### Version Control Tools

| Tool | Description |
|------|-------------|
| `vcs_commit` | Create a version control commit |
| `vcs_log` | View commit history |
| `vcs_diff` | Show differences between versions |
| `vcs_revert` | Revert document to a previous commit |
| `vcs_branch_create` | Create a new branch |
| `vcs_branch_switch` | Switch to a different branch |
| `vcs_branch_list` | List all branches |

### Registering Custom Tools

```typescript
// In agent-bridge.ts or via IPC
agentBridge.registerTool({
  name: 'my_custom_tool',
  description: 'Does something custom',
  parameters: {
    input: { type: 'string', description: 'Input text', required: true }
  }
}, async (args) => {
  return { result: args.input }
})
```

## Hermes Agent Integration

Agentic Word is compatible with the [Hermes Agent](https://github.com/NousResearch/hermes-agent) ACP protocol. The agent bridge generates an ACP manifest for tool discovery:

```json
{
  "name": "agentic-word",
  "version": "0.1.0",
  "capabilities": {
    "tools": [ ... ]
  },
  "protocol": "acp-1.0"
}
```

To connect Hermes Agent:

1. Start Agentic Word
2. Configure the AI endpoint in Settings (⚙) — point to your Hermes/Ollama/OpenAI endpoint
3. Use the chat sidebar to interact with the agent
4. The agent will autonomously call tools to edit your document

## Version Control

Built-in VCS works like a simplified git:

- **Commits** — Save document snapshots with messages
- **Branches** — Create parallel editing branches (e.g., `draft`, `review`)
- **Diff** — Line-by-line comparison between any two commits
- **Revert** — Restore document to any previous commit
- **Log** — Chronological history of all changes

Version data is stored in `.wordapp-vcs/vcs.json` alongside your project.

## Configuration

Open the AI Agent Settings (⚙ icon in toolbar) to configure:

| Setting | Default | Description |
|---------|---------|-------------|
| API Endpoint | `http://localhost:11434/v1` | OpenAI-compatible chat completions endpoint |
| API Key | *(empty)* | Optional, required for cloud providers |
| Model | `hermes3` | Model name to use |

Works out of the box with [Ollama](https://ollama.ai) running locally.

## Tech Stack

- **Electron** — Native desktop shell
- **React 19** — UI framework
- **TipTap** — Rich text editor (ProseMirror)
- **Zustand** — State management
- **mammoth.js** — DOCX → HTML import
- **docx** — HTML → DOCX export
- **electron-vite** — Build tooling
- **TypeScript** — Type safety throughout

## License

MIT
