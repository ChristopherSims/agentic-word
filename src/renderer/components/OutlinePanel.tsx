import React, { type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const OutlinePanel: FC = () => {
  const { outlineOpen, outlineHeadings, setOutlineOpen } = useAppStore()

  if (!outlineOpen) return null

  const handleClick = (position: number) => {
    const editor = document.querySelector('.tiptap') as HTMLElement | null
    if (!editor) return
    // Find the heading at this position in the DOM and scroll to it
    const allHeadings = editor.querySelectorAll('h1, h2, h3')
    for (const h of allHeadings) {
      const el = h as HTMLElement
      // Match by text content
      const heading = outlineHeadings.find((oh) => oh.position === position)
      if (heading && el.textContent?.trim() === heading.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        break
      }
    }
  }

  return (
    <div className="outline-panel">
      <div className="outline-header">
        <span style={{ fontSize: 12, fontWeight: 600 }}>Outline</span>
        <button className="toolbar-btn" style={{ width: 20, height: 20, fontSize: 10 }} onClick={() => setOutlineOpen(false)}>✕</button>
      </div>
      <div className="outline-body">
        {outlineHeadings.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: 8 }}>No headings found</div>
        ) : (
          outlineHeadings.map((h, i) => (
            <div
              key={i}
              className="outline-item"
              style={{ paddingLeft: (h.level - 1) * 12 + 8 }}
              onClick={() => handleClick(h.position)}
            >
              <span className="outline-level">H{h.level}</span>
              <span className="outline-text">{h.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
