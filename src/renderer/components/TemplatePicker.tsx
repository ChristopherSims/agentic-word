import React, { useState, useEffect, type FC } from 'react'
import { useAppStore } from '../store/app-store'

interface TemplateInfo {
  name: string
  description: string
}

export const TemplatePicker: FC = () => {
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [selected, setSelected] = useState<string>('blank')

  useEffect(() => {
    window.wordapp?.template.list().then((list) => {
      if (list) setTemplates(list as TemplateInfo[])
    }).catch(() => {})
  }, [])

  const handleCreate = async () => {
    const content = await window.wordapp?.template.get(selected)
    if (content) {
      const store = useAppStore.getState()
      store.setDocumentContent(content)
      store.setDocumentTitle(selected.charAt(0).toUpperCase() + selected.slice(1))
      store.setCurrentFilePath(null)
      store.setDirty(true)
    }
    useAppStore.getState().setCommandPaletteOpen(false)
  }

  return (
    <div className="template-grid">
      {templates.map((t) => (
        <div
          key={t.name}
          className={`template-card${selected === t.name ? ' selected' : ''}`}
          onClick={() => setSelected(t.name)}
          onDoubleClick={() => { setSelected(t.name); handleCreate() }}
        >
          <div className="template-card-name">{t.name}</div>
          <div className="template-card-desc">{t.description}</div>
        </div>
      ))}
      <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={handleCreate}>
        Create from {selected}
      </button>
    </div>
  )
}
