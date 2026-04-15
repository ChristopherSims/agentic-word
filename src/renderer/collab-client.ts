import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useAppStore } from './store/app-store'

let ydoc: Y.Doc | null = null
let wsProvider: WebsocketProvider | null = null
let ytext: Y.XmlText | null = null
let awareness: any = null
let cursorBroadcastInterval: ReturnType<typeof setInterval> | null = null

export function connectCollab(roomCode: string, userName: string, userColor: string, serverUrl: string): boolean {
  try {
    ydoc = new Y.Doc()
    ytext = ydoc.getXmlText('document')

    // Connect to WebSocket server
    wsProvider = new WebsocketProvider(serverUrl, roomCode, ydoc, {
      connect: true,
      params: { name: userName, color: userColor }
    })

    awareness = wsProvider.awareness

    // Set local user info in awareness
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

    // Listen for remote cursor updates via custom messages
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
        // Not a JSON message — likely Yjs protocol
      }
    })

    // Broadcast local cursor position periodically
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
    }, 500)

    useAppStore.getState().setCollabConnected(true)
    useAppStore.getState().setCollabRoomCode(roomCode)
    return true
  } catch (err) {
    console.error('Collab connect failed:', err)
    return false
  }
}

export function disconnectCollab(): void {
  if (cursorBroadcastInterval) { clearInterval(cursorBroadcastInterval); cursorBroadcastInterval = null }
  if (wsProvider) { wsProvider.destroy(); wsProvider = null }
  if (ydoc) { ydoc.destroy(); ydoc = null }
  ytext = null
  awareness = null
  useAppStore.getState().setCollabConnected(false)
  useAppStore.getState().setCollabRoomCode(null)
  useAppStore.getState().setCollabCursors([])
  useAppStore.getState().setCollabUsers([])
}

export function getYText(): Y.XmlText | null {
  return ytext
}

export function getYDoc(): Y.Doc | null {
  return ydoc
}

// Sync Yjs document content to/from the TipTap editor HTML
export function syncYjsToContent(): string | null {
  if (!ytext) return null
  return ytext.toString()
}

export function syncContentToYjs(html: string): void {
  if (!ytext || !ydoc) return
  ydoc.transact(() => {
    const current = ytext.toString()
    if (current !== html) {
      ytext.delete(0, ytext.length)
      ytext.insert(0, html)
    }
  })
}
