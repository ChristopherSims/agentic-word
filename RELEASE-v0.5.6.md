# Agentic Word v0.5.6 Release Notes

**Release Date:** 2026-04-24

---

## Highlights

v0.5.6 is a feature-packed release that brings a completely rebuilt VCS visualization, a new Template Gallery, and real-time streaming AI chat responses.

---

## What's New

### Lane-based DAG Commit Graph

The VCS panel now renders commits in a proper lane-based DAG (Directed Acyclic Graph) instead of a flat chronological list.

- **Branch lanes** — Each branch occupies a dedicated vertical column. No more interleaved commits.
- **Curved connectors** — Bezier paths connect commits across lanes. Merge commits show diamond markers.
- **Interactive** — Zoom (0.5x–2.0x), click-drag pan, mouse-wheel zoom. Hover for commit details (hash, message, timestamp, branch, tags). Click a node to diff against its parent.
- **Branch legend** — Color-coded chips map each branch to its lane color.
- **Pure SVG** — Zero external dependencies, fully responsive.

### Commit Range Diff & Branch Comparison

Compare any two points in your document's history directly inside the VCS panel.

- **Range diff mode** — In the Diff tab, toggle "Range mode" and pick From/To commits from dropdowns.
- **Branch comparison** — In the Branches tab, select two branches and hit Compare to diff their heads.
- **Unified viewer** — Reuses the existing inline/side-by-side diff rendering for consistency.

### Template Gallery

Browse, load, save, and manage document templates from a dedicated dialog.

- **Built-in templates** — Blank, Letter, Resume, Report, and Memo with descriptive cards and MUI icons.
- **Custom templates** — Save the current document as a custom template (stored in `userData/custom-templates`). Custom templates appear with a "Custom" badge.
- **One-click load** — Selecting a template sets the document content + title and clears the file path.
- **Accessible everywhere** — File menu ("Template Gallery..."), Command Palette, and `Ctrl+Shift+T`.
- **Backend persistence** — `template-list` merges built-in + custom templates. `template-get` checks custom dir first, falls back to built-ins.

### Streaming AI Assistant Chat

The Agent Workspace chat now streams responses token-by-token instead of showing nothing until the full response is complete.

- **Incremental rendering** — Each SSE chunk from the LLM is appended to the assistant bubble in real-time.
- **Streaming placeholder** — A placeholder assistant message appears immediately with a spinner while tokens arrive.
- **Stop button** — `chatLoading` stays active from send until `agent-stream-done` or `agent-stream-error`, so the stop button works mid-stream.
- **Error handling** — Stream errors surface as red error bubbles in the chat.

---

## Changed

- **File menu** — "New from Template..." renamed to "Template Gallery..."
- **VcsPanel Diff tab** — Added range-mode toggle and commit selectors.
- **VcsPanel Branches tab** — Added Branch A/B selectors with Compare button.

---

## Files Added

| File | Description |
|------|-------------|
| `src/renderer/components/DagGraph.tsx` | SVG DAG graph with lanes, zoom, pan, tooltip, legend |
| `src/renderer/components/TemplateGalleryDialog.tsx` | Template gallery dialog with grid layout, save/delete |

## Files Modified

| File | Change |
|------|--------|
| `src/shared/types.ts` | Added `lane: number` to `VcsGraphNode` |
| `src/renderer/types.ts` | Mirrored `lane` field in renderer graph node type |
| `src/main/vcs-engine.ts` | Added `computeLanes()` and branch-to-color mapping |
| `src/main/index.ts` | Updated template handlers; wired template menu items |
| `src/renderer/components/VcsPanel.tsx` | Integrated `<DagGraph />`; added range diff + branch compare UI |
| `src/renderer/components/CommandPalette.tsx` | Added "Template Gallery..." command |
| `src/renderer/App.tsx` | Renders `<TemplateGalleryDialog />`; updated `file-new-template` handler |
| `src/renderer/store/app-store.ts` | Added `templateGalleryOpen` state; added streaming actions (`appendChatStreamToken`, `finalizeStreamingMessage`, `addChatErrorMessage`) |
| `src/renderer/components/AgentWorkspacePanel.tsx` | Wired IPC stream listeners; updated send handlers; added streaming spinner |

---

## Quality Metrics

- **TypeScript:** Zero errors (`npx tsc --noEmit`)
- **IPC handlers:** Verified (template list/get/save/delete, VCS graph, streaming chat)
- **DAG graph:** Renders correctly with lane-based layout
- **Diff features:** Range diff and branch comparison wired to existing diff engine
- **Streaming chat:** Tokens append in real-time; stop/abort and error paths tested

---

## Known Limitations

- **Build on WSL:** `npm run build` fails due to missing `@rollup/rollup-linux-x64-gnu` (node_modules installed on Windows). Run builds from Windows cmd/PowerShell.

---

## Upgrade Path

1. Pull latest changes on `master`.
2. Run `npm install` from Windows cmd/PowerShell (not WSL).
3. Start dev mode with `npm run dev`.
4. Configure your AI endpoint in **Settings → Agent** if using the streaming chat.

---

*Full changelog available in `CHANGELOG.md`.*
