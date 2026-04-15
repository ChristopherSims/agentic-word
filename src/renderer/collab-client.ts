import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useAppStore } from './store/app-store'

let ydoc: Y.Doc | null = null
let wsProvider: WebsocketProvider | null = null
let awareness: any = null
let cursorBroadcastInterval: ReturnType<typeof setInterval> | null = null

/**
 * Connect to a collab room.
 * Returns the Y.Doc — the caller must pass it to TipTap's Collaboration extension.
 */
export function connectCollab(roomCode: string, userName: string, userColor: string, serverUrl: string): Y.Doc | null {
  try {
    ydoc = new Y.Doc()

    // Connect to WebSocket server
    wsProvider = new WebsocketProvider(serverUrl, roomCode, ydoc, {
      connect: true,
      params: { name: userName, color: userColor }
    })

    awareness = wsProvider.awareness

    // Set local user info in awareness (used by CollaborationCursor)
    awareness.setLocalStateField('user', { name: userName, color: userColor })

    // Listen for awareness changes (presence)
    awareness.on('change', () => {
      const users: Array<{ name: string; color: string; online: boolean }> = []
      awareness.getStates().forEach((state: any) => {
        if (state.user) {
          users.push({ name: state.user.name, color: state.user.color, online: true })
        }
      })
      useAppStore.getState().setCollabUsers(users)
    })

    // Listen for custom messages (remote cursors)
    wsProvider.on('message', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'remote-cursor') {
          const cursors = [...useAppStore.getState().collabCursors]
          const idx = cursors.findIndex((c) => c.id === data.userId)
          const cursor = {
            id: data.userId,
            name: data.name,
            color: data.color,
            position: data.position,
            selection: data.selection,
            lastSeen: Date.now()
          }
          if (idx >= 0) cursors[idx] = cursor
          else cursors.push(cursor)
          useAppStore.getState().setCollabCursors(cursors)
        }
        if (data.type === 'presence') {
          const users = data.users.map((u: any) => ({ ...u, online: true }))
          useAppStore.getState().setCollabUsers(users)
        }
      } catch {
        // Not JSON — likely Yjs protocol message, handled by y-websocket
      }
    })

    // Broadcast local cursor position (debounced to 1s)
    cursorBroadcastInterval = setInterval(() => {
      if (wsProvider?.ws?.readyState === 1) {
        const editor = document.querySelector('.tiptap') as any
        const pos = editor?.editorView?.state?.selection?.from ?? 0
        const sel = editor?.editorView?.state?.selection
        const selection = sel && sel.from !== sel.to ? { from: sel.from, to: sel.to } : undefined
        const msg = JSON.stringify({
          type: 'cursor-update',
          userId: `local-${Date.now()}`,
          position: pos,
          selection
        })
        wsProvider.ws.send(msg)
      }
    }, 1000)

    useAppStore.getState().setCollabConnected(true)
    useAppStore.getState().setCollabRoomCode(roomCode)
    return ydoc
  } catch (err) {
    console.error('Collab connect failed:', err)
    return null
  }
}

export function disconnectCollab(): void {
  if (cursorBroadcastInterval) { clearInterval(cursorBroadcastInterval); cursorBroadcastInterval = null }
  if (wsProvider) { wsProvider.destroy(); wsProvider = null }
  if (ydoc) { ydoc.destroy(); ydoc = null }
  awareness = null
  useAppStore.getState().setCollabConnected(false)
  useAppStore.getState().setCollabRoomCode(null)
  useAppStore.getState().setCollabCursors([])
  useAppStore.getState().setCollabUsers([])
}

/** Get the current Y.Doc (or null if not connected). */
export function getYDoc(): Y.Doc | null {
  return ydoc
}
