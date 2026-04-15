import React, { useEffect, useRef, type FC } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/extension-starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { Extension } from '@tiptap/core'
import { useAppStore } from '../store/app-store'

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, string>) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}
        }
      }
    }]
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
    }
  }
})

export const SplitEditor: FC = () => {
  const documentContent = useAppStore((s) => s.documentContent)
  const editorFont = useAppStore((s) => s.editorFont)
  const lineSpacing = useAppStore((s) => s.lineSpacing)
  const scrollRef = useRef<HTMLDivElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline, Placeholder.configure({ placeholder: '' }),
      Link.configure({ openOnClick: false }), Image,
      Table.configure({ resizable: true }), TableRow, TableCell, TableHeader,
      TextStyle, Color, FontFamily, FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] })
    ],
    content: documentContent || '<p></p>',
    editable: false,
    editorProps: {
      attributes: { class: 'tiptap tiptap-split' }
    }
  })

  useEffect(() => {
    if (editor && documentContent !== editor.getHTML()) {
      editor.commands.setContent(documentContent || '<p></p>')
    }
  }, [documentContent, editor])

  // Synced scrolling
  useEffect(() => {
    const main = scrollRef.current
    const mirror = mirrorRef.current
    if (!main || !mirror) return

    const syncScroll = () => { mirror.scrollTop = main.scrollTop }
    main.addEventListener('scroll', syncScroll)
    return () => main.removeEventListener('scroll', syncScroll)
  }, [])

  return (
    <div className="split-view-container">
      <div className="split-pane" ref={scrollRef}>
        <div className="split-pane-label">Editor</div>
      </div>
      <div className="split-divider" />
      <div className="split-pane split-pane-mirror" ref={mirrorRef}>
        <div className="split-pane-label">Preview</div>
        <div className="editor-content" style={{ fontFamily: `"${editorFont}", monospace`, lineHeight: lineSpacing }}>
          {editor && <EditorContent editor={editor} />}
        </div>
      </div>
    </div>
  )
}
