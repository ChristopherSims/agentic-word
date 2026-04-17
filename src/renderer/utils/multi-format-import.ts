/**
 * Multi-Format Import Utilities
 * Handles imports from various sources and formats
 */

export interface ImportResult {
  success: boolean
  content: string
  title?: string
  error?: string
  warnings: string[]
}

/**
 * Imports Google Docs content from URL
 * Requires the document to be publicly accessible
 */
export async function importFromGoogleDocs(documentUrl: string): Promise<ImportResult> {
  const warnings: string[] = []

  try {
    // Validate Google Docs URL format
    const docIdMatch = documentUrl.match(/\/document\/d\/([a-zA-Z0-9-_]+)/)
    if (!docIdMatch) {
      return {
        success: false,
        content: '',
        error: 'Invalid Google Docs URL. Please ensure it follows the format: https://docs.google.com/document/d/...'
      }
    }

    const docId = docIdMatch[1]

    // Google Docs export URL for plain text/markdown
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`

    const response = await fetch(exportUrl, { mode: 'cors' })

    if (!response.ok) {
      return {
        success: false,
        content: '',
        error: `Failed to fetch Google Docs (HTTP ${response.status}). Ensure the document is publicly accessible.`,
        warnings
      }
    }

    const content = await response.text()

    if (content.length === 0) {
      warnings.push('Document appears to be empty')
    }

    return {
      success: true,
      content,
      title: `Imported from Google Docs - ${new Date().toLocaleDateString()}`,
      warnings
    }
  } catch (err) {
    return {
      success: false,
      content: '',
      error: `Failed to import from Google Docs: ${(err as Error).message}`,
      warnings
    }
  }
}

/**
 * Imports Notion document content from URL
 * Requires the document to be publicly accessible
 */
export async function importFromNotion(pageUrl: string): Promise<ImportResult> {
  const warnings: string[] = []

  try {
    // Validate Notion URL format
    if (!pageUrl.includes('notion.so')) {
      return {
        success: false,
        content: '',
        error: 'Invalid Notion URL. Please ensure it is a Notion page URL.'
      }
    }

    warnings.push('Notion import is limited. Complex formatting may not be preserved.')
    warnings.push('Please ensure the Notion page is set to "Public" sharing.')

    // Notion doesn't have direct API for public pages, provide instructions
    return {
      success: false,
      content: '',
      error: 'Direct Notion import requires API key. Please copy and paste content from Notion.',
      warnings
    }
  } catch (err) {
    return {
      success: false,
      content: '',
      error: `Failed to process Notion URL: ${(err as Error).message}`,
      warnings
    }
  }
}

/**
 * Extracts text from PDF content
 * Works with PDF text (not scanned images)
 */
export async function importFromPDF(fileContent: ArrayBuffer | Uint8Array): Promise<ImportResult> {
  const warnings: string[] = []

  try {
    // Check for PDF header
    const header = new Uint8Array(fileContent).slice(0, 4)
    const headerStr = String.fromCharCode(...Array.from(header))

    if (headerStr !== '%PDF') {
      return {
        success: false,
        content: '',
        error: 'File is not a valid PDF document.'
      }
    }

    warnings.push('PDF text extraction is basic. Complex layouts may not be well represented.')
    warnings.push('Images and embedded media will not be imported.')

    // Basic PDF text extraction logic
    // Looking for text streams between BT and ET operators
    const uint8Array = new Uint8Array(fileContent)
    let text = ''

    // Decode using a simple approach - look for readable text
    let currentString = ''
    for (let i = 0; i < uint8Array.length; i++) {
      const byte = uint8Array[i]
      const char = String.fromCharCode(byte)

      // Include printable ASCII and common extended chars
      if ((byte >= 32 && byte <= 126) || (byte >= 192 && byte <= 255)) {
        currentString += char
      } else {
        if (currentString.length > 3) {
          text += currentString + ' '
        }
        currentString = ''
      }
    }

    // Extract text streams more systematically
    const textMatch = new TextDecoder().decode(uint8Array).match(/BT[\s\S]*?ET/g)
    if (textMatch) {
      text = textMatch
        .join('\n')
        .replace(/\//g, ' ')
        .replace(/[<()[\]{}]/g, '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n')
    }

    if (text.length === 0) {
      warnings.push('No text content found in PDF. Document may be image-based.')
    }

    return {
      success: true,
      content: text || '(PDF extraction did not yield readable text)',
      title: 'Imported from PDF',
      warnings
    }
  } catch (err) {
    return {
      success: false,
      content: '',
      error: `Failed to extract text from PDF: ${(err as Error).message}`,
      warnings
    }
  }
}

/**
 * Fetches and parses web page content
 */
export async function importFromWebPage(url: string): Promise<ImportResult> {
  const warnings: string[] = []

  try {
    // Validate URL
    const urlObj = new URL(url)

    // Fetch the page
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WordApp)'
      }
    })

    if (!response.ok) {
      return {
        success: false,
        content: '',
        error: `Failed to fetch webpage (HTTP ${response.status})`
      }
    }

    const html = await response.text()

    // Extract text from HTML
    // Remove scripts and styles
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      .trim()

    if (text.length === 0) {
      warnings.push('No text content found in webpage')
    } else {
      warnings.push('HTML structure was not preserved. Use the original webpage for formatting.')
    }

    return {
      success: true,
      content: text,
      title: `Imported from ${urlObj.hostname}`,
      warnings
    }
  } catch (err) {
    return {
      success: false,
      content: '',
      error: `Failed to import from webpage: ${(err as Error).message}`,
      warnings
    }
  }
}

/**
 * Parses Markdown file content
 * Validates and optionally transforms markdown
 */
export function importFromMarkdown(content: string, validateStructure: boolean = true): ImportResult {
  const warnings: string[] = []

  if (!content || content.trim().length === 0) {
    return {
      success: false,
      content: '',
      error: 'Markdown file appears to be empty'
    }
  }

  // Basic validation
  if (validateStructure) {
    const headingCount = (content.match(/^#+\s/gm) || []).length
    const linkCount = (content.match(/\[.+?\]\(.+?\)/g) || []).length
    const codeBlockCount = (content.match(/```/g) || []).length

    if (headingCount === 0) {
      warnings.push('No headings found. Consider adding structure with # headings.')
    }

    if (codeBlockCount % 2 !== 0) {
      warnings.push('Unmatched code blocks detected. Check for missing ``` markers.')
    }

    // Check for common markdown issues
    if (content.match(/^\d+\.\s/gm)) {
      const listItems = content.match(/^\d+\.\s.+/gm) || []
      const unorderedItems = content.match(/^-\s.+/gm) || []

      if (unorderedItems.length > 0 && !content.match(/^-\s/gm)) {
        warnings.push('Mixed list formats detected. Consider using consistent list syntax.')
      }
    }
  }

  return {
    success: true,
    content,
    title: 'Imported Markdown',
    warnings
  }
}

/**
 * Validates import source and returns user-friendly guidance
 */
export function getImportSourceInfo(source: string): {
  supported: boolean
  requiresPublicAccess: boolean
  instructions: string[]
  limitations: string[]
} {
  const sources: Record<
    string,
    {
      supported: boolean
      requiresPublicAccess: boolean
      instructions: string[]
      limitations: string[]
    }
  > = {
    'google-docs': {
      supported: true,
      requiresPublicAccess: true,
      instructions: [
        'Open your Google Docs document',
        'Click "Share" in the top right',
        'Set sharing to "Anyone with the link can view"',
        'Copy the document URL',
        'Paste it in the import dialog'
      ],
      limitations: [
        'Only plain text is imported (formatting not preserved)',
        'Comments and revisions are not imported',
        'Complex formatting may be lost'
      ]
    },
    notion: {
      supported: true,
      requiresPublicAccess: true,
      instructions: [
        'Open your Notion page',
        'Click the "..." menu in the top right',
        'Select "Share"',
        'Enable "Share to web" and copy the link',
        'Paste it in the import dialog'
      ],
      limitations: [
        'Notion API integration not yet available',
        'Please copy and paste content manually for now',
        'Databases and advanced features not supported'
      ]
    },
    pdf: {
      supported: true,
      requiresPublicAccess: false,
      instructions: [
        'Select a PDF file from your computer',
        'The text content will be extracted automatically',
        'You can then edit and format it in WordApp'
      ],
      limitations: [
        'Only text-based PDFs are supported (not scanned images)',
        'Complex layouts and formatting will not be preserved',
        'Images embedded in PDFs are not imported'
      ]
    },
    webpage: {
      supported: true,
      requiresPublicAccess: true,
      instructions: [
        'Paste the URL of any publicly accessible webpage',
        'Text content will be extracted automatically',
        'HTML structure and formatting will not be preserved'
      ],
      limitations: [
        'Only plain text is extracted',
        'Dynamic content (JavaScript-rendered) may not work',
        'Images and media are not imported'
      ]
    },
    markdown: {
      supported: true,
      requiresPublicAccess: false,
      instructions: [
        'Select a Markdown file (.md) from your computer',
        'Preview the content before importing',
        'Formatting and structure will be preserved'
      ],
      limitations: ['None - full Markdown support']
    }
  }

  return sources[source] || { supported: false, requiresPublicAccess: false, instructions: [], limitations: [] }
}
