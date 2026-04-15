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
    } else if (ext === 'md') {
      const md = this.htmlToMarkdown(htmlContent)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, md, 'utf-8')
    } else {
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, htmlContent, 'utf-8')
    }

    this.currentFilePath = filePath
  }

  getCurrentFilePath(): string | null {
    return this.currentFilePath
  }

  // ─── Templates ───

  getTemplate(name: string): string {
    const templates: Record<string, string> = {
      blank: '<p></p>',
      letter: `<h1>Letter</h1>
<p>Date: ${new Date().toLocaleDateString()}</p>
<p><br></p>
<p>Dear Recipient,</p>
<p><br></p>
<p>Body of the letter goes here.</p>
<p><br></p>
<p>Sincerely,</p>
<p>Your Name</p>`,
      resume: `<h1>John Doe</h1>
<p>email@example.com · (555) 123-4567 · LinkedIn: linkedin.com/in/johndoe</p>
<h2>Professional Summary</h2>
<p>Experienced professional with expertise in relevant field. Proven track record of delivering results and driving innovation.</p>
<h2>Experience</h2>
<h3>Job Title — Company Name</h3>
<p><em>Month Year – Present</em></p>
<ul>
<li>Key accomplishment or responsibility</li>
<li>Another notable achievement with measurable impact</li>
<li>Leadership or initiative demonstrated</li>
</ul>
<h3>Previous Role — Previous Company</h3>
<p><em>Month Year – Month Year</em></p>
<ul>
<li>Responsibility or project</li>
<li>Quantified result or improvement</li>
</ul>
<h2>Education</h2>
<h3>Degree — University Name</h3>
<p><em>Year</em></p>
<h2>Skills</h2>
<p>Skill 1, Skill 2, Skill 3, Skill 4, Skill 5</p>`,
      report: `<h1>Report Title</h1>
<p><em>Author Name · ${new Date().toLocaleDateString()}</em></p>
<h2>Executive Summary</h2>
<p>Brief overview of the report's key findings and recommendations.</p>
<h2>Introduction</h2>
<p>Background and context for the report.</p>
<h2>Findings</h2>
<h3>Finding 1</h3>
<p>Description of the first major finding.</p>
<h3>Finding 2</h3>
<p>Description of the second major finding.</p>
<h2>Recommendations</h2>
<ul>
<li>Recommendation 1</li>
<li>Recommendation 2</li>
<li>Recommendation 3</li>
</ul>
<h2>Conclusion</h2>
<p>Summary of key takeaways.</p>`,
      memo: `<h1>MEMORANDUM</h1>
<p><strong>TO:</strong> Recipient</p>
<p><strong>FROM:</strong> Sender</p>
<p><strong>DATE:</strong> ${new Date().toLocaleDateString()}</p>
<p><strong>RE:</strong> Subject</p>
<hr>
<p><br></p>
<p>Body of the memo goes here.</p>
<p><br></p>
<p>Action items or next steps.</p>`
    }
    return templates[name] || templates['blank']
  }

  listTemplates(): Array<{ name: string; description: string }> {
    return [
      { name: 'blank', description: 'Empty document' },
      { name: 'letter', description: 'Formal letter format' },
      { name: 'resume', description: 'Professional resume' },
      { name: 'report', description: 'Structured report' },
      { name: 'memo', description: 'Business memorandum' }
    ]
  }

  // ─── HTML to Markdown ───

  htmlToMarkdown(html: string): string {
    let md = html
    // Headings
    md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
    // Bold/italic
    md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    // Underline (no MD equivalent — use <u>)
    md = md.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '<u>$1</u>')
    // Strikethrough
    md = md.replace(/<(s|strike|del)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~')
    // Lists
    md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    // Remove list containers
    md = md.replace(/<\/?(ul|ol)[^>]*>/gi, '')
    // Paragraphs
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n')
    // Horizontal rules
    md = md.replace(/<hr[^>]*>/gi, '---\n\n')
    // Links
    md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    // Images
    md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)')
    md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)')
    // Blockquotes
    md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n\n')
    // Code
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    // Line breaks
    md = md.replace(/<br[^>]*>/gi, '\n')
    // Strip remaining tags
    md = md.replace(/<[^>]+>/g, '')
    // Decode entities
    md = md.replace(/&nbsp;/g, ' ')
    md = md.replace(/&amp;/g, '&')
    md = md.replace(/&lt;/g, '<')
    md = md.replace(/&gt;/g, '>')
    md = md.replace(/&quot;/g, '"')
    // Clean up excessive newlines
    md = md.replace(/\n{3,}/g, '\n\n')
    return md.trim() + '\n'
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
