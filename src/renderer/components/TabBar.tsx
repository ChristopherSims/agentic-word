import React, { type FC } from 'react'
import { useAppStore } from '../store/app-store'

export const TabBar: FC = () => {
  const { docTabs, activeTabId, switchDocTab, closeDocTab, addDocTab } = useAppStore()

  return (
    <div className="tab-bar">
      {docTabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item${tab.id === activeTabId ? ' active' : ''}`}
          onClick={() => switchDocTab(tab.id)}
        >
          <span className="tab-title">
            {tab.isDirty ? '● ' : ''}{tab.title}
          </span>
          {docTabs.length > 1 && (
            <button
              className="tab-close"
              onClick={(e) => { e.stopPropagation(); closeDocTab(tab.id) }}
            >✕</button>
          )}
        </div>
      ))}
      <button className="tab-new" onClick={() => addDocTab({ title: 'Untitled', filePath: null, content: '', isDirty: false })} title="New Tab (Ctrl+T)">+</button>
    </div>
  )
}
