/**
 * Hook for navigating to and scrolling headings into view.
 * 
 * Consolidates near-identical logic from:
 * - OutlinePanel.tsx (L15-22)
 * - TableOfContentsPanel.tsx (L35-46)
 */

export function useHeadingNavigation() {
  /**
   * Find a heading in the editor by position/text and scroll it into view.
   * @param position - The heading position identifier
   * @param headingData - Array of heading objects with { position, text } properties
   */
  const navigateToHeading = (
    position: number,
    headingData: Array<{ position: number; text: string }>
  ): void => {
    const editor = document.querySelector('.tiptap') as HTMLElement | null
    if (!editor) return

    const allHeadings = editor.querySelectorAll('h1, h2, h3')
    for (const h of allHeadings) {
      const el = h as HTMLElement
      const heading = headingData.find((oh) => oh.position === position)
      if (heading && el.textContent?.trim() === heading.text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        break
      }
    }
  }

  return { navigateToHeading }
}
