import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { type Node as PmNode } from '@tiptap/pm/model'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// ─── PageBreak extension ───
// Inserts a visible page break marker in the editor

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak: () => ReturnType
    }
    fontSize: {
      setFontSize: (size: string) => ReturnType
      unsetFontSize: () => ReturnType
    }
  }
}

export const PageBreak = Extension.create({
  name: 'pageBreak',

  addOptions() { return { indent: false } },

  addCommands() {
    return {
      insertPageBreak: () => ({ editor }) => {
        editor.chain().focus().insertContent('<div data-page-break="true" style="page-break-after: always; border: none; border-top: 1px dashed #999; margin: 1em 0; text-align: center; color: #999; font-size: 10px;" contenteditable="false">--- Page Break ---</div><p></p>').run()
        return true
      }
    }
  }
})

// ─── FontSize extension ───
// Allows setting custom font sizes via the textStyle mark

export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] } },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, string>) => {
            if (!attrs.fontSize) return {}
            return { style: `font-size: ${attrs.fontSize}` }
          }
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




// ─── Autocorrect extension ───
// Replaces common typos, smart quotes, em-dashes on space/enter
export const Autocorrect = Extension.create({
  name: 'autocorrect',

  addOptions() { return { enabled: true, smartQuotes: true, emDash: true } },

  addProseMirrorPlugins() {
    const enabled = () => this.options.enabled
    const sq = () => this.options.smartQuotes
    const ed = () => this.options.emDash

    const TYPOS: Record<string, string> = {
      'teh': 'the', 'adn': 'and', 'taht': 'that', 'thsi': 'this',
      'si': 'is', 'ot': 'to', 'fi': 'if', 'nad': 'and',
      'hte': 'the', 'nwe': 'new', 'fo': 'of', 'jsut': 'just',
      'liek': 'like', 'waht': 'what', 'htey': 'they', 'oyu': 'you',
      'ahve': 'have', 'abotu': 'about', 'ahd': 'had', 'ido': 'I do',
      'dont': "don't", 'cant': "can't", 'wont': "won't",
      'im': "I'm", 'ive': "I've", 'id': "I'd", 'ill': "I'll"
    }

    return [
      new Plugin({
        key: new PluginKey('autocorrect'),
        props: {
          handleTextInput: (view, _from, _to, text) => {
            if (!enabled()) return false
            if (text !== ' ' && text !== '\n') return false

            const { $from } = view.state.selection
            const textBefore = $from.parent.textContent.slice(0, $from.parentOffset)
            const wordMatch = textBefore.match(/(\S+)$/)

            if (!wordMatch) return false

            const word = wordMatch[1]
            let replacement: string | null = null

            // Typo correction
            if (TYPOS[word.toLowerCase()]) {
              const corrected = TYPOS[word.toLowerCase()]
              replacement = word[0] === word[0].toUpperCase()
                ? corrected[0].toUpperCase() + corrected.slice(1)
                : corrected
            }

            // Smart quotes (on last character before space)
            if (sq() && !replacement) {
              const lastChar = textBefore.slice(-1)
              if (lastChar === '"') replacement = textBefore.slice(0, -1) + '\u201D'
              else if (lastChar === "'") replacement = textBefore.slice(0, -1) + '\u2019'
            }

            // Em-dash: two hyphens → em-dash
            if (ed() && !replacement && textBefore.endsWith('--')) {
              replacement = textBefore.slice(0, -2) + '\u2014'
            }

            if (!replacement) return false

            // Apply the replacement
            const from = $from.pos - word.length
            const to = $from.pos
            const tr = view.state.tr.insertText(replacement + text, from, to)
            view.dispatch(tr)
            return true
          }
        }
      }),

      // Smart quotes on opening: when user types " or ' at start of word
      new Plugin({
        key: new PluginKey('smartQuotesOpen'),
        props: {
          handleTextInput: (view, _from, _to, text) => {
            if (!enabled() || !sq()) return false
            if (text !== '"' && text !== "'") return false

            const { $from } = view.state.selection
            const pos = $from.parentOffset
            // Opening quote: at start of line or after space
            if (pos === 0 || /^[\s\u2014(\[{]$/.test($from.parent.text?.[pos - 1] || '')) {
              const openQuote = text === '"' ? '\u201C' : '\u2018'
              const tr = view.state.tr.insertText(openQuote)
              view.dispatch(tr)
              return true
            }
            return false
          }
        }
      })
    ]
  }
})

// ─── Comment Mark extension ───
// Marks a text range with a comment thread highlight
export const CommentMark = Extension.create({
  name: 'commentMark',

  addOptions() { return { HTMLAttributes: { class: 'comment-highlight' } } },

  parseHTML() { return [{ tag: 'span[data-comment-id]' }] },
  renderHTML({ HTMLAttributes }) { return ['span', { ...HTMLAttributes, class: 'comment-highlight' }, 0] },

  addCommands() {
    return {
      setCommentMark: (commentId: string) => ({ commands }) => {
        return commands.setMark('commentMark', { 'data-comment-id': commentId })
      },
      unsetCommentMark: () => ({ commands }) => {
        return commands.unsetMark('commentMark')
      }
    }
  }
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setCommentMark: (commentId: string) => ReturnType
      unsetCommentMark: () => ReturnType
    }
  }
}

// ─── Inline Suggestion Ghost (Copilot-style) ───
// Shows gray suggestion text at the cursor position.
// Tab to accept, Escape to dismiss. Auto-dismiss on cursor move/typing.

export const inlineSuggestionKey = new PluginKey('inlineSuggestion')

export const InlineSuggestionGhost = Extension.create({
  name: 'inlineSuggestionGhost',

  addOptions() {
    return {
      suggestion: '',
      onAccept: null as ((text: string) => void) | null,
      onDismiss: null as (() => void) | null
    }
  },

  addProseMirrorPlugins() {
    const extension = this

    return [
      new Plugin({
        key: inlineSuggestionKey,
        state: {
          init() { return { suggestion: '', from: 0 } },
          apply(tr, prev) {
            const meta = tr.getMeta(inlineSuggestionKey)
            if (meta) return meta
            // Auto-dismiss on any user interaction (cursor move, click, typing)
            if ((tr.selectionSet || tr.docChanged) && prev.suggestion) {
              return { suggestion: '', from: 0 }
            }
            return prev
          }
        },
        props: {
          decorations(state) {
            const data = inlineSuggestionKey.getState(state) || { suggestion: '', from: 0 }
            if (!data.suggestion) return DecorationSet.empty

            const widget = Decoration.widget(
              state.selection.from,
              () => {
                const span = document.createElement('span')
                span.className = 'inline-suggestion-ghost'
                span.style.pointerEvents = 'none'
                span.textContent = data.suggestion
                return span
              },
              { side: 1 }
            )
            return DecorationSet.create(state.doc, [widget])
          },
          // Direct ProseMirror-level key handler — fires before TipTap's shortcut
          // resolution, ensuring Tab reliably accepts suggestions in Electron.
          handleKeyDown(view, event) {
            const pluginState = inlineSuggestionKey.getState(view.state)
            if (!pluginState?.suggestion) return false

            if (event.key === 'Tab' && event.shiftKey) {
              event.preventDefault()
              const { state, dispatch } = view
              const from = state.selection.from
              const tr = state.tr.insertText(pluginState.suggestion, from, from)
              tr.setMeta(inlineSuggestionKey, { suggestion: '', from: 0 })
              dispatch(tr)
              return true
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              const { state, dispatch } = view
              dispatch(state.tr.setMeta(inlineSuggestionKey, { suggestion: '', from: 0 }))
              return true
            }

            return false
          }
        }
      })
    ]
  },

  addCommands() {
    return {
      setInlineSuggestion: (text: string, from: number) => ({ tr, dispatch }) => {
        if (dispatch) {
          dispatch(tr.setMeta(inlineSuggestionKey, { suggestion: text, from }))
        }
        return true
      },
      clearInlineSuggestion: () => ({ tr, dispatch }) => {
        if (dispatch) {
          dispatch(tr.setMeta(inlineSuggestionKey, { suggestion: '', from: 0 }))
        }
        return true
      },
      acceptInlineSuggestion: () => ({ editor, tr, dispatch }) => {
        const data = inlineSuggestionKey.getState(editor.state)
        if (!data || !data.suggestion) return false
        if (dispatch) {
          const currentPos = editor.state.selection.from
          const insertTr = editor.state.tr.insertText(data.suggestion, currentPos, currentPos)
          insertTr.setMeta(inlineSuggestionKey, { suggestion: '', from: 0 })
          dispatch(insertTr)
        }
        return true
      }
    }
  },

  addKeyboardShortcuts() {
    return {
      'Shift-Tab': ({ editor }) => {
        const data = inlineSuggestionKey.getState(editor.state)
        if (data && data.suggestion) {
          editor.commands.acceptInlineSuggestion()
          return true
        }
        return false
      },
      Escape: ({ editor }) => {
        const data = inlineSuggestionKey.getState(editor.state)
        if (data && data.suggestion) {
          editor.commands.clearInlineSuggestion()
          return true
        }
        return false
      }
    }
  }
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineSuggestionGhost: {
      setInlineSuggestion: (text: string, from: number) => ReturnType
      clearInlineSuggestion: () => ReturnType
      acceptInlineSuggestion: () => ReturnType
    }
  }
}
