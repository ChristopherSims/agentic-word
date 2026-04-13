import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'

export class DocumentStore {
  private currentFilePath: string | null = null

  async openFile(filePath: string): Promise<{ content: string; filePath: string }> {
    const ext = filePath.split('.').pop()?.toLowerCase()

    if (ext === 'docx') {
      const mammoth = await import('mammoth')
      const buffer = await readFile(filePath)
      const result = await mammoth.convertToHtml({ buffer })
      this.currentFilePath = filePath
      return { content: result.value, filePath }
    }

    const content = await readFile(filePath, 'utf-8')
    this.currentFilePath = filePath

    if (ext === 'md') {
      return { content: this.markdownToHtml(content), filePath }
    }

    return { content, filePath }
  }

  async saveFile(filePath: string, htmlContent: string): Promise<void> {
    const ext = filePath.split('.').pop()?.toLowerCase()

    if (ext === 'docx') {
      await this.saveAsDocx(filePath, htmlContent)
    } else {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, htmlContent, 'utf-8')
    }

    this.currentFilePath = filePath
  }

  getCurrentFilePath(): string | null {
    return this.currentFilePath
  }

  private async saveAsDocx(filePath: string, htmlContent: string): Promise<void> {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, UnderlineType } = await import('docx')

    const paragraphs = this.htmlToDocxParagraphs(htmlContent, { Paragraph, TextRun, HeadingLevel, UnderlineType })
    const doc = new Document({
      sections: [{ properties: {}, children: paragraphs }]
    })

    const buffer = await Packer.toBuffer(doc)
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, Buffer.from(buffer))
  }

  private htmlToDocxParagraphs(
    html: string,
    docx: { Paragraph: typeof import('docx').Paragraph; TextRun: typeof import('docx').TextRun; HeadingLevel: typeof import('docx').HeadingLevel; UnderlineType: typeof import('docx').UnderlineType }
  ): unknown[] {
    const paragraphs: unknown[] = []

    // Simple regex-based HTML parser for Node.js (no DOMParser available)
    const blockRegex = /<(h[1-3]|p|div|li|blockquote)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi
    let match: RegExpExecArray | null
    let lastIndex = 0

    while ((match = blockRegex.exec(html)) !== null) {
      // Text before this block
      if (match.index > lastIndex) {
        const textBefore = html.slice(lastIndex, match.index).replace(/<[^>]+>/g, '').trim()
        if (textBefore) {
          paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun(textBefore)] }))
        }
      }

      const tag = match[1].toLowerCase()
      const innerHtml = match[2]
      const runs = this.htmlRunsToDocxRuns(innerHtml, docx)

      if (tag.startsWith('h')) {
        const level = tag === 'h1' ? docx.HeadingLevel.HEADING_1
          : tag === 'h2' ? docx.HeadingLevel.HEADING_2
          : docx.HeadingLevel.HEADING_3
        paragraphs.push(new docx.Paragraph({ heading: level, children: runs }))
      } else if (tag === 'li') {
        paragraphs.push(new docx.Paragraph({
          children: [new docx.TextRun({ text: '• ' }), ...runs]
        }))
      } else {
        paragraphs.push(new docx.Paragraph({ children: runs }))
      }

      lastIndex = match.index + match[0].length
    }

    // Remaining text
    if (lastIndex < html.length) {
      const remaining = html.slice(lastIndex).replace(/<[^>]+>/g, '').trim()
      if (remaining) {
        paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun(remaining)] }))
      }
    }

    if (paragraphs.length === 0) {
      paragraphs.push(new docx.Paragraph({ children: [new docx.TextRun('')] }))
    }

    return paragraphs
  }

  private htmlRunsToDocxRuns(
    html: string,
    docx: { TextRun: typeof import('docx').TextRun; UnderlineType: typeof import('docx').UnderlineType }
  ): unknown[] {
    const runs: unknown[] = []

    // Match inline formatting: <strong>, <b>, <em>, <i>, <u>, <s>, <code>
    const inlineRegex = /<(strong|b|em|i|u|s|strike|code)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = inlineRegex.exec(html)) !== null) {
      // Text before this inline
      if (match.index > lastIndex) {
        const textBefore = html.slice(lastIndex, match.index).replace(/<[^>]+>/g, '').trim()
        if (textBefore) runs.push(new docx.TextRun(textBefore))
      }

      const tag = match[1].toLowerCase()
      const text = match[2].replace(/<[^>]+>/g, '')

      if (tag === 'strong' || tag === 'b') {
        runs.push(new docx.TextRun({ text, bold: true }))
      } else if (tag === 'em' || tag === 'i') {
        runs.push(new docx.TextRun({ text, italics: true }))
      } else if (tag === 'u') {
        runs.push(new docx.TextRun({ text, underline: { type: docx.UnderlineType.SINGLE } }))
      } else if (tag === 's' || tag === 'strike') {
        runs.push(new docx.TextRun({ text, strike: true }))
      } else {
        runs.push(new docx.TextRun(text))
      }

      lastIndex = match.index + match[0].length
    }

    // Remaining text
    if (lastIndex < html.length) {
      const remaining = html.slice(lastIndex).replace(/<[^>]+>/g, '').trim()
      if (remaining) runs.push(new docx.TextRun(remaining))
    }

    if (runs.length === 0) {
      const plain = html.replace(/<[^>]+>/g, '').trim()
      if (plain) runs.push(new docx.TextRun(plain))
    }

    return runs
  }

  private markdownToHtml(md: string): string {
    return md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*<\/li>)/g, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
  }
}
