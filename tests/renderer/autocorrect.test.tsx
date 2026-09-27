// @vitest-environment jsdom
/**
 * Regression tests for the autocorrect space handler. The original bug: the
 * smart-quote and em-dash branches built line-sized replacements
 * (`textBefore.slice(0, -1) + '”'`) but inserted them into word-sized ranges
 * (`$from.pos - word.length`), re-inserting the whole line prefix into the
 * document — pressing space at the end of a line duplicated the line.
 *
 * The tests drive the ProseMirror `handleTextInput` prop directly (typed input
 * goes through it; `insertContentAt` bypasses the input pipeline).
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Autocorrect } from '../../src/renderer/extensions'

type TextInputProp = (view: unknown, from: number, to: number, text: string) => boolean | undefined

/**
 * Fire the autocorrect plugin's handleTextInput as ProseMirror would for a
 * typed space. ProseMirror stops at the first plugin that returns true.
 */
function fireSpace(editor: Editor): boolean {
  const handlers = editor.state.plugins
    .map((p) => (p as unknown as { props?: { handleTextInput?: TextInputProp } }).props?.handleTextInput)
    .filter((h): h is TextInputProp => typeof h === 'function')
  const pos = editor.state.selection.to
  for (const handler of handlers) {
    if (handler(editor.view, pos, pos, ' ') === true) return true
  }
  return false
}

describe('Autocorrect space handler', () => {
  let editor: Editor

  beforeEach(() => {
    editor = new Editor({
      extensions: [StarterKit, Autocorrect.configure({ enabled: true, smartQuotes: true, emDash: true })],
      content: ''
    })
  })

  it('pressing space after a plain word does not duplicate the line', () => {
    editor.commands.setContent('<p>The mountain village was quiet</p>')
    editor.commands.focus('end')
    const handled = fireSpace(editor)
    expect(handled).toBe(false) // nothing to correct — default behavior
    expect(editor.getText()).toBe('The mountain village was quiet')
  })

  it('pressing space after a trailing straight quote converts it, without duplicating the line', () => {
    editor.commands.setContent('<p>He said "hello"</p>')
    editor.commands.focus('end')
    expect(fireSpace(editor)).toBe(true)
    // Curly close quote applied + the typed space; the line prefix is not re-inserted.
    expect(editor.getText()).toBe('He said "hello\u201D ')
  })

  it('pressing space after -- converts to an em-dash, without duplicating the line', () => {
    editor.commands.setContent('<p>He said--</p>')
    editor.commands.focus('end')
    expect(fireSpace(editor)).toBe(true)
    expect(editor.getText()).toBe('He said\u2014 ')
  })

  it('corrects a typo word in place (word branch unchanged)', () => {
    editor.commands.setContent('<p>teh</p>')
    editor.commands.focus('end')
    expect(fireSpace(editor)).toBe(true)
    expect(editor.getText()).toBe('the ')
  })

  it('preserves capitalization in typo correction', () => {
    editor.commands.setContent('<p>Teh</p>')
    editor.commands.focus('end')
    expect(fireSpace(editor)).toBe(true)
    expect(editor.getText()).toBe('The ')
  })
})