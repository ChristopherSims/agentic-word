/**
 * Core TipTap operation executor
 * Applies structured edits to a TipTap editor instance
 */

import type { Editor } from '@tiptap/core'
import type { TiptapOp, TiptapToolInput } from '../tiptap-tool-types'

export function applyTiptapOps(editor: Editor, input: TiptapToolInput): void {
  const { ops } = input

  ops.forEach((op) => {
    switch (op.type) {
      case 'insert_text':
        if (typeof op.pos === 'number') {
          editor.chain().focus().insertContentAt(op.pos, op.text).run()
        } else {
          editor.chain().focus().insertContent(op.text).run()
        }
        break

      case 'replace_range':
        editor
          .chain()
          .focus()
          .deleteRange({ from: op.from, to: op.to })
          .insertContentAt(op.from, op.text)
          .run()
        break

      case 'add_heading':
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'heading',
            attrs: { level: op.level },
            content: [{ type: 'text', text: op.text }]
          })
          .run()
        break

      case 'add_paragraph':
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'paragraph',
            content: [{ type: 'text', text: op.text }]
          })
          .run()
        break

      case 'bullet_list':
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'bulletList',
            content: op.items.map((item) => ({
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: item }]
                }
              ]
            }))
          })
          .run()
        break

      case 'bold':
        editor
          .chain()
          .focus()
          .setTextSelection({ from: op.from, to: op.to })
          .toggleBold()
          .run()
        break

      case 'italic':
        editor
          .chain()
          .focus()
          .setTextSelection({ from: op.from, to: op.to })
          .toggleItalic()
          .run()
        break

      default:
        throw new Error(`Unsupported op: ${(op as any).type}`)
    }
  })
}
