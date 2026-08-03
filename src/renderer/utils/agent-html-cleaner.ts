/**
 * Normalize agent-generated HTML before inserting into TipTap editor.
 * Strips whitespace between block tags (</p>\n<p> → </p><p>),
 * collapses excessive <br>, removes empty <p>, and trims.
 */
export function cleanAgentHtml(html: string): string {
  return html
    // Strip all whitespace between block-level closing and opening tags
    .replace(/(<\/(?:p|h[1-6]|ul|ol|li|blockquote|div|pre)>)\s+(<(?:p|h[1-6]|ul|ol|li|blockquote|div|pre|br))/gi, '$1$2')
    // Collapse 3+ consecutive <br> → 2
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    // Remove empty <p> tags
    .replace(/<p>\s*<\/p>/gi, '')
    // Collapse 2+ consecutive newlines → single newline
    .replace(/\n\s*\n+/g, '\n')
    // Trim leading/trailing whitespace
    .replace(/^\s+/, '')
    .replace(/\s+$/, '')
}