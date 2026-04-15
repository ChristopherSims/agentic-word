// Collab WebSocket Server — runs alongside the Electron app
// Uses Yjs for CRDT-based conflict-free editing + presence awareness
const { WebSocketServer } = require('ws')
const { Doc, applyUpdate, encodeStateAsUpdate } = require('yjs')
const { setupWSConnection } = require('y-websocket/bin/utils')

let wss = null
const rooms = new Map() // roomCode -> { doc: YDoc, conns: Set<ws> }

function startServer(port = 12345) {
  if (wss) return { status: 'already-running' }

  wss = new WebSocketServer({ port })

  wss.on('connection', (ws, req) => {
    // Parse room from URL: ws://host:port/roomCode
    const url = new URL(req.url, `ws://${req.headers.host}`)
    const roomCode = url.pathname.slice(1) || 'default'
    const userName = url.searchParams.get('name') || 'Anonymous'
    const userColor = url.searchParams.get('color') || '#89b4fa'

    // Join or create room
    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, { doc: new Doc(), conns: new Set(), users: new Map() })
    }
    const room = rooms.get(roomCode)
    room.conns.add(ws)
    room.users.set(ws, { name: userName, color: userColor })

    // Setup Yjs sync via y-websocket
    setupWSConnection(ws, room.doc, { docName: roomCode })

    // Broadcast presence to all in room
    broadcastPresence(roomCode)

    ws.on('close', () => {
      room.conns.delete(ws)
      room.users.delete(ws)
      if (room.conns.size === 0) {
        rooms.delete(roomCode)
      } else {
        broadcastPresence(roomCode)
      }
    })

    // Handle cursor/selection updates (custom message type)
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'cursor-update') {
          // Broadcast cursor position to others in the room
          const cursorData = {
            type: 'remote-cursor',
            userId: msg.userId,
            name: userName,
            color: userColor,
            position: msg.position,
            selection: msg.selection
          }
          for (const conn of room.conns) {
            if (conn !== ws && conn.readyState === 1) {
              conn.send(JSON.stringify(cursorData))
            }
          }
        }
      } catch {
        // Not JSON — likely a Yjs protocol message, handled by y-websocket
      }
    })
  })

  return { status: 'started', port }
}

function stopServer() {
  if (wss) {
    wss.close()
    wss = null
    rooms.clear()
    return { status: 'stopped' }
  }
  return { status: 'not-running' }
}

function getStatus() {
  if (!wss) return { running: false }
  const roomList = []
  for (const [code, room] of rooms) {
    roomList.push({ code, users: room.conns.size })
  }
  return { running: true, port: wss.address().port, rooms: roomList }
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function broadcastPresence(roomCode) {
  const room = rooms.get(roomCode)
  if (!room) return
  const users = []
  for (const [, info] of room.users) {
    users.push({ name: info.name, color: info.color })
  }
  const msg = JSON.stringify({ type: 'presence', users })
  for (const conn of room.conns) {
    if (conn.readyState === 1) conn.send(msg)
  }
}

module.exports = { startServer, stopServer, getStatus, generateRoomCode }
