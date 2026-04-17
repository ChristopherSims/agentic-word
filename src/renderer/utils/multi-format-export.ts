/**
 * Multi-Format Export Utilities
 * Handles EPUB, LaTeX, RTF, and CSV export formats
 */

/**
 * Converts markdown to EPUB-compatible HTML
 * Basic EPUB format support
 */
export function convertToEpub(content: string, title: string, author: string = 'WordApp'): string {
  // EPUB uses XHTML format
  const xhtml = content
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^###### (.+)$/gm, '<h6>$1</h6>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<img alt="$1" src="$2" />')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/```(.*?)\n([\s\S]*?)```/gm, '<pre><code>$2</code></pre>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')

  return `<?xml version='1.0' encoding='utf-8'?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta name="author" content="${author}" />
</head>
<body>
  <p>${xhtml}</p>
</body>
</html>`
}

/**
 * Converts markdown to LaTeX format
 * Suitable for academic and technical documents
 */
export function convertToLatex(content: string, title: string, author: string = 'WordApp'): string {
  let latex = `\\documentclass[12pt]{article}
\\usepackage[utf-8]{inputenc}
\\usepackage{geometry}
\\usepackage{graphicx}
\\usepackage{listings}
\\usepackage{xcolor}
\\usepackage{hyperref}

\\geometry{margin=1in}

\\title{${title}}
\\author{${author}}
\\date{\\today}

\\lstset{
  breaklines=true,
  language=Python,
  basicstyle=\\ttfamily\\small,
  keywordstyle=\\color{blue},
  commentstyle=\\color{gray},
  stringstyle=\\color{red},
  backgroundcolor=\\color{gray!10}
}

\\begin{document}

\\maketitle
\\tableofcontents
\\newpage

`

  // Convert markdown to LaTeX
  latex += content
    .replace(/^# (.+)$/gm, '\\section{$1}')
    .replace(/^## (.+)$/gm, '\\subsection{$1}')
    .replace(/^### (.+)$/gm, '\\subsubsection{$1}')
    .replace(/^#### (.+)$/gm, '\\paragraph{$1}')
    .replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}')
    .replace(/\*(.+?)\*/g, '\\textit{$1}')
    .replace(/^`(.+?)$/gm, '\\texttt{$1}')
    .replace(/```(.*?)\n([\s\S]*?)```/gm, '\\begin{lstlisting}\n$2\n\\end{lstlisting}')
    .replace(/!\[(.+?)\]\((.+?)\)/g, '\\includegraphics[width=0.8\\textwidth]{$2}')
    .replace(/\[(.+?)\]\((.+?)\)/g, '\\href{$2}{$1}')
    .replace(/^- (.+)$/gm, '\\item $1')
    .replace(/^(\d+)\. (.+)$/gm, '\\item $2')
    .replace(/^> (.+)$/gm, '\\textit{> $1}')

  latex += '\n\\end{document}'

  return latex
}

/**
 * Converts markdown to RTF format
 * Rich Text Format for compatibility with Word processors
 */
export function convertToRtf(content: string, title: string): string {
  let rtf = `{\\rtf1\\ansi\\ansicpg1252\\cocoartf2
{\\fonttbl
  {\\f0\\fswiss Helvetica;}
  {\\f1\\fmodern Courier;}
}
{\\colortbl;\\red255\\green0\\blue0;\\red0\\green0\\blue255;}
{\\*\\expandedcolortbl;;}
\\pard\\pardirnatural\\partightenfactor100

\\f0\\fs24\\b ${title}\\b0\\par
\\par
`

  // Convert markdown to RTF - simplified version
  const lines = content.split('\n')

  lines.forEach((line) => {
    if (line.startsWith('# ')) {
      rtf += `\\b\\fs28 ${line.substring(2)}\\b0\\fs24\\par\\par`
    } else if (line.startsWith('## ')) {
      rtf += `\\b\\fs26 ${line.substring(3)}\\b0\\fs24\\par\\par`
    } else if (line.startsWith('### ')) {
      rtf += `\\b\\fs24 ${line.substring(4)}\\b0\\fs24\\par\\par`
    } else if (line.startsWith('- ')) {
      rtf += `\\bullet ${line.substring(2)}\\par`
    } else if (line.match(/^\d+\.\s/)) {
      rtf += `${line}\\par`
    } else if (line.trim()) {
      // Process inline formatting
      let processed = line
        .replace(/\*\*(.+?)\*\*/g, '\\b $1\\b0 ')
        .replace(/\*(.+?)\*/g, '\\i $1\\i0 ')
        .replace(/`(.+?)`/g, '{\\f1 $1}')

      rtf += `${processed}\\par`
    } else {
      rtf += '\\par'
    }
  })

  rtf += '\n}'

  return rtf
}

/**
 * Converts table content to CSV format
 * Extracts tables from markdown and converts to CSV
 */
export function extractTablesToCSV(content: string): string[] {
  const csvFiles: string[] = []

  // Simple markdown table pattern: | cell | cell |
  const tableRegex = /\|(.+)\|[\s\S]*?(?=\n\n|$)/g
  let match

  let tableIndex = 0

  while ((match = tableRegex.exec(content)) !== null) {
    const tableContent = match[0]
    const rows = tableContent.split('\n').filter((row) => row.trim().startsWith('|') && row.trim().endsWith('|'))

    if (rows.length > 0) {
      let csv = ''

      rows.forEach((row, index) => {
        // Remove leading and trailing pipes and split by pipes
        const cells = row
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((cell) => {
            // Remove separator dashes if header divider row
            if (cell.match(/^-+$/)) {
              return ''
            }
            // Escape quotes and wrap in quotes if contains comma
            return cell.trim().includes(',') ? `"${cell.trim().replace(/"/g, '""')}"` : cell.trim()
          })

        // Skip separator rows
        if (!cells.every((cell) => cell === '' || cell === '-')) {
          csv += cells.join(',') + '\n'
        }
      })

      if (csv.trim()) {
        csvFiles.push(csv)
        tableIndex++
      }
    }
  }

  return csvFiles
}

/**
 * Converts markdown to plain CSV (single table from entire content)
 * Used when content is primarily tabular
 */
export function convertToCSV(content: string): string {
  const csvFiles = extractTablesToCSV(content)

  if (csvFiles.length > 0) {
    return csvFiles[0]
  }

  // Fallback: convert lines to CSV format
  const lines = content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      // Escape columns with commas
      return line.includes(',') ? `"${line.replace(/"/g, '""')}"` : line
    })

  return lines.join('\n')
}

/**
 * Validates export options for each format
 */
export function validateExportFormat(format: string, content: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []

  if (!content || content.trim().length === 0) {
    return { valid: false, warnings: ['Content is empty'] }
  }

  switch (format) {
    case 'excel':
      const csvFiles = extractTablesToCSV(content)
      if (csvFiles.length === 0) {
        warnings.push('No tables found. Content will be converted to single column CSV.')
      }
      break
    case 'latex':
      if (!content.match(/^#+ /m)) {
        warnings.push('No headings found. LaTeX document may not have proper structure.')
      }
      break
    case 'epub':
      if (content.length > 500000) {
        warnings.push('Content is large. EPUB export may take longer.')
      }
      break
    case 'rtf':
      if (content.match(/!\[.*?\]\(http/g)) {
        warnings.push('Remote images in RTF may not display properly.')
      }
      break
  }

  return { valid: true, warnings }
}
