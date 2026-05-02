import React, { useEffect, useState, type FC } from 'react'
import { type Editor } from '@tiptap/react'

interface CursorInfo {
  id: string
  name: string
  color: string
  position: number
  selection?: { from: number; to: number }
}

interface CursorCoords {
  id: string
  name: string
  color: string
  left: number
  top: number
  selLeft?: number
  selWidth?: number
}

/** Renders remote collaborator cursor positions and selections as SVG-style overlays. */
export const CollabCursorOverlay: FC<{ editor: Editor; cursors: CursorInfo[] }> = ({ editor, cursors }) => {
  const [coords, setCoords] = useState<CursorCoords[]>([])

  useEffect(() => {
    const updateCoords = () => {
      const editorEl = document.querySelector('.tiptap')
      if (!editorEl) return
      const editorRect = editorEl.getBoundingClientRect()
      const view = editor.view
      const newCoords: CursorCoords[] = []

      for (const c of cursors) {
        // coordsAtPos can throw if position is out of range or view is transitioning
        try {
          const pos = Math.min(c.position, view.state.doc.content.size - 1)
          const domPos = view.coordsAtPos(pos)
          newCoords.push({
            id: c.id,
            name: c.name,
            color: c.color,
            left: domPos.left - editorRect.left,
            top: domPos.top - editorRect.top,
            ...(c.selection ? {
              selLeft: view.coordsAtPos(c.selection.from).left - editorRect.left,
              selWidth: view.coordsAtPos(c.selection.to).left - view.coordsAtPos(c.selection.from).left,
            } : {}),
          })
        } catch { /* position out of range during transition */ }
      }
      setCoords(newCoords)
    }
    updateCoords()
    const interval = setInterval(updateCoords, 300)
    return () => clearInterval(interval)
  }, [editor, cursors])

  return (
    <div className="collab-cursors-overlay" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
      {coords.map((c) => (
        <div key={c.id}>
          {c.selWidth !== undefined && c.selLeft !== undefined && c.selWidth > 0 && (
            <div style={{ position: 'absolute', left: c.selLeft, top: c.top, width: c.selWidth, height: 20, background: c.color, opacity: 0.15, borderRadius: 2 }} />
          )}
          <div style={{ position: 'absolute', left: c.left, top: c.top, width: 2, height: 20, background: c.color, borderRadius: 1 }} />
          <div style={{ position: 'absolute', left: c.left - 2, top: c.top - 16, background: c.color, color: '#fff', fontSize: 10, fontWeight: 600, lineHeight: '14px', padding: '1px 4px', borderRadius: '3px 3px 3px 0', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{c.name}</div>
        </div>
      ))}
    </div>
  )
}
