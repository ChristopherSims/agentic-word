import React, { useState, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const MdPreview: FC = () => {
  const { mdPreviewOpen, mdPreviewHtml, setMdPreviewOpen, setMdPreviewHtml, documentContent, currentFilePath } = useAppStore()
  const [isMarkdown, setIsMarkdown] = useState(false)

  useEffect(() => {
    setIsMarkdown(currentFilePath?.endsWith('.md') || false)
  }, [currentFilePath])

  // Auto-render markdown preview when open and file is .md
  useEffect(() => {
    if (mdPreviewOpen && isMarkdown && documentContent) {
      window.wordapp?.markdown.toHtml(documentContent).then((html) => {
        if (html) setMdPreviewHtml(html as string)
      }).catch(() => {})
    }
  }, [mdPreviewOpen, isMarkdown, documentContent])

  if (!mdPreviewOpen) return null

  return (
    <div className="md-preview-panel">
      <div className="md-preview-header">
        <span style={{ fontSize: 12, fontWeight: 600 }}>Markdown Preview</span>
        <button className="toolbar-btn" style={{ width: 20, height: 20, fontSize: 10 }} onClick={() => setMdPreviewOpen(false)}>✕</button>
      </div>
      <div
        className="md-preview-body tiptap"
        dangerouslySetInnerHTML={{ __html: mdPreviewHtml || '<p style="color:var(--text-muted)">No markdown content to preview</p>' }}
      />
    </div>
  )
}
