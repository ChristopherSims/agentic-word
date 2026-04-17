/**
 * PDF Export Utility
 * Handles generation of PDFs with customizable options
 */

export type PageSize = 'A3' | 'A4' | 'A5' | 'Legal' | 'Letter' | 'Tabloid'

export interface PdfExportOptions {
  pageSize: PageSize
  includeHeader: boolean
  headerText?: string
  includeFooter: boolean
  footerText?: string
  includeTableOfContents: boolean
  preservePageBreaks: boolean
  imageQuality: 'low' | 'medium' | 'high'
  embedImages: boolean
  margins: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

export const PAGE_SIZES: Record<PageSize, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Legal: { width: 215.9, height: 355.6 },
  Letter: { width: 215.9, height: 279.4 },
  Tabloid: { width: 279.4, height: 431.8 }
}

const DEFAULT_PDF_EXPORT_OPTIONS: PdfExportOptions = {
  pageSize: 'A4',
  includeHeader: false,
  headerText: '',
  includeFooter: false,
  footerText: '',
  includeTableOfContents: false,
  preservePageBreaks: true,
  imageQuality: 'high',
  embedImages: true,
  margins: {
    top: 20,
    bottom: 20,
    left: 20,
    right: 20
  }
}

/**
 * Generates a table of contents from markdown headings
 */
function generateTableOfContents(content: string): string {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const headings: Array<{ level: number; text: string }> = []
  let match

  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim()
    })
  }

  if (headings.length === 0) return ''

  let toc = '# Table of Contents\n\n'
  headings.forEach((heading) => {
    const indent = '  '.repeat(heading.level - 1)
    const anchor = heading.text.toLowerCase().replace(/\s+/g, '-')
    toc += `${indent}- [${heading.text}](#${anchor})\n`
  })

  return toc + '\n---\n\n'
}

/**
 * Extracts images from markdown content
 */
function extractImages(content: string): string[] {
  const imageRegex = /!\[.*?\]\((.*?)\)/g
  const images: string[] = []
  let match

  while ((match = imageRegex.exec(content)) !== null) {
    if (match[1] && !match[1].startsWith('data:')) {
      images.push(match[1])
    }
  }

  return images
}

/**
 * Converts image quality setting to compression ratio
 */
function getImageCompressionRatio(quality: 'low' | 'medium' | 'high'): number {
  const ratios: Record<'low' | 'medium' | 'high', number> = {
    low: 0.5,
    medium: 0.75,
    high: 0.95
  }
  return ratios[quality]
}

/**
 * Inserts page breaks in content for PDF
 */
function insertPageBreaks(content: string): string {
  // Add page break after level 1 headings and after every ~3000 characters
  return content
    .replace(/^# /gm, '\n---\n# ')
    .split('')
    .reduce((acc, char, index) => {
      acc += char
      if (index % 3000 === 0 && index > 0 && !acc.endsWith('\n---\n')) {
        acc += '\n---\n'
      }
      return acc
    }, '')
}

/**
 * Prepares content for PDF export with selected options
 */
export function preparePdfContent(
  content: string,
  options: Partial<PdfExportOptions> = {}
): { html: string; options: PdfExportOptions } {
  const finalOptions: PdfExportOptions = { ...DEFAULT_PDF_EXPORT_OPTIONS, ...options }

  let processedContent = content

  // Add table of contents if requested
  if (finalOptions.includeTableOfContents) {
    const toc = generateTableOfContents(content)
    processedContent = toc + processedContent
  }

  // Insert page breaks if requested
  if (finalOptions.preservePageBreaks) {
    processedContent = insertPageBreaks(processedContent)
  }

  // Add header if requested
  if (finalOptions.includeHeader && finalOptions.headerText) {
    processedContent = `**${finalOptions.headerText}**\n\n${processedContent}`
  }

  // Add footer if requested
  if (finalOptions.includeFooter && finalOptions.footerText) {
    processedContent = `${processedContent}\n\n**${finalOptions.footerText}**`
  }

  // Extract images info for processing (actual embedding happens in Electron)
  const images = finalOptions.embedImages ? extractImages(processedContent) : []

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      font-family: 'Segoe UI', sans-serif;
      line-height: 1.6;
      color: #333;
      margin: ${finalOptions.margins.top}mm ${finalOptions.margins.right}mm ${finalOptions.margins.bottom}mm ${finalOptions.margins.left}mm;
    }
    h1 { font-size: 28px; margin-top: 30px; margin-bottom: 15px; page-break-after: avoid; }
    h2 { font-size: 24px; margin-top: 20px; margin-bottom: 10px; page-break-after: avoid; }
    h3 { font-size: 20px; margin-top: 15px; margin-bottom: 8px; page-break-after: avoid; }
    h4 { font-size: 18px; margin-top: 12px; margin-bottom: 6px; page-break-after: avoid; }
    h5 { font-size: 16px; margin-top: 10px; margin-bottom: 5px; page-break-after: avoid; }
    h6 { font-size: 14px; margin-top: 10px; margin-bottom: 5px; page-break-after: avoid; }
    p { margin: 10px 0; }
    strong { font-weight: 600; }
    em { font-style: italic; }
    code { 
      background-color: #f4f4f4; 
      padding: 2px 6px; 
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre { 
      background-color: #f4f4f4; 
      padding: 12px; 
      border-radius: 4px;
      overflow-x: auto;
      page-break-inside: avoid;
    }
    blockquote {
      border-left: 4px solid #ddd;
      margin-left: 0;
      padding-left: 15px;
      color: #666;
      page-break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f9f9f9;
      font-weight: 600;
    }
    img {
      max-width: 100%;
      height: auto;
      margin: 15px 0;
    }
    hr { 
      border: none;
      border-top: 1px solid #ddd;
      margin: 40px 0;
      page-break-after: always;
    }
    ul, ol {
      margin: 10px 0;
    }
    li {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  ${processedContent}
</body>
</html>
  `

  return { html, options: finalOptions }
}

/**
 * Validates PDF export options
 */
export function validatePdfOptions(options: Partial<PdfExportOptions>): string[] {
  const errors: string[] = []

  if (options.pageSize && !Object.keys(PAGE_SIZES).includes(options.pageSize)) {
    errors.push(`Invalid page size: ${options.pageSize}`)
  }

  if (options.margins) {
    if ((options.margins.top ?? 0) < 0 || (options.margins.top ?? 0) > 50) {
      errors.push('Top margin must be between 0 and 50mm')
    }
    if ((options.margins.bottom ?? 0) < 0 || (options.margins.bottom ?? 0) > 50) {
      errors.push('Bottom margin must be between 0 and 50mm')
    }
    if ((options.margins.left ?? 0) < 0 || (options.margins.left ?? 0) > 50) {
      errors.push('Left margin must be between 0 and 50mm')
    }
    if ((options.margins.right ?? 0) < 0 || (options.margins.right ?? 0) > 50) {
      errors.push('Right margin must be between 0 and 50mm')
    }
  }

  if (options.imageQuality && !['low', 'medium', 'high'].includes(options.imageQuality)) {
    errors.push('Image quality must be low, medium, or high')
  }

  return errors
}

/**
 * Gets info about images in content for preview/confirmation
 */
export function getImageInfo(content: string): { count: number; paths: string[] } {
  const images = extractImages(content)
  return {
    count: images.length,
    paths: images
  }
}
