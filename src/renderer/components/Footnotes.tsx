import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { ReactNodeViewRenderer, type NodeViewWrapper } from '@tiptap/react'
import React, { useState, type FC } from 'react'

// Footnote reference node (inline, superscript number)
const FootnoteReference = Node.create({
  name: 'footnoteReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
      number: { default: 1 }
    }
  },

  parseHTML() {
    return [{ tag: 'footnote-reference' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['footnote-reference', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FootnoteRefView)
  },

  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ state, dispatch }) => {
          // Count existing footnotes to assign number
          let count = 0
          state.doc.descendants((node: { type: { name: string } }) => {
            if (node.type.name === 'footnoteReference') count++
          })
          const node = this.type.create({ id: `fn-${Date.now()}`, number: count + 1 })
          if (dispatch) {
            dispatch(state.tr.replaceSelectionWith(node, false))
          }
          return true
        }
    }
  }
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnoteReference: {
      insertFootnote: () => ReturnType
    }
  }
}

// React view for the superscript reference
const FootnoteRefView: FC<{ nodeViewWrapper: NodeViewWrapper; node: { attrs: { number: number; id: string } }; editor: Editor }> = (props) => {
  const { node, editor } = props
  return (
    <sup
      className="footnote-ref"
      contentEditable={false}
      onClick={() => {
        // Scroll to corresponding footnote at bottom
        const el = document.querySelector(`[data-footnote-id="${node.attrs.id}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth' })
      }}
      style={{
        color: 'var(--accent)',
        cursor: 'pointer',
        fontSize: '0.75em',
        fontWeight: 600,
        verticalAlign: 'super'
      }}
    >
      {node.attrs.number}
    </sup>
  )
}

// Footnote content block (block-level, at document end)
const FootnoteContent = Node.create({
  name: 'footnoteContent',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      id: { default: null },
      number: { default: 1 }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-footnote-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ class: 'footnote-content', 'data-footnote-id': HTMLAttributes.id }, HTMLAttributes), 0]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-f': () => this.editor.commands.insertFootnote()
    }
  }
})

export { FootnoteReference, FootnoteContent }

// Footnotes section renderer — shows all footnote content at bottom of doc
export const FootnotesSection: FC<{ editor: Editor | null }> = ({ editor }) => {
  const [footnotes, setFootnotes] = useState<Array<{ id: string; number: number; content: string }>>([])

  // Extract footnotes from editor content
  React.useEffect(() => {
    if (!editor) return
    const updateFootnotes = () => {
      const fns: Array<{ id: string; number: number; content: string }> = []
      editor.state.doc.descendants((node: { type: { name: string }; attrs: { id: string; number: number }; content: { size: number } }) => {
        if (node.type.name === 'footnoteReference') {
          fns.push({ id: node.attrs.id, number: node.attrs.number, content: '' })
        }
      })
      setFootnotes(fns)
    }
    updateFootnotes()
    editor.on('update', updateFootnotes)
    return () => { editor.off('update', updateFootnotes) }
  }, [editor])

  if (footnotes.length === 0) return null

  return (
    <div className="footnotes-section">
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0 8px' }} />
      {footnotes.map((fn) => (
        <div key={fn.id} className="footnote-entry" data-footnote-id={fn.id}>
          <sup style={{ color: 'var(--accent)', fontWeight: 600, marginRight: 4 }}>{fn.number}</sup>
          <span
            className="footnote-text"
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => {
              // Update footnote content in the document
              const text = e.currentTarget.textContent || ''
              setFootnotes((prev) => prev.map((f) => f.id === fn.id ? { ...f, content: text } : f))
            }}
          >
            {fn.content || 'Click to edit...'}
          </span>
        </div>
      ))}
    </div>
  )
}
