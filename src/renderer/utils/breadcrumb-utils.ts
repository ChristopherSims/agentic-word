/**
 * Breadcrumb navigation utilities
 * Generates breadcrumb path from document headings
 */

export interface BreadcrumbItem {
  label: string
  level: number // h1=1, h2=2, etc.
  id: string
  lineNumber: number
}

/**
 * Extract headings from HTML content to build breadcrumb path
 */
export function extractHeadings(htmlContent: string): BreadcrumbItem[] {
  const headings: BreadcrumbItem[] = []
  const parser = new DOMParser()

  try {
    const doc = parser.parseFromString(htmlContent, 'text/html')
    const headingElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')

    let lineNumber = 1
    headingElements.forEach((el, idx) => {
      const level = parseInt(el.tagName[1])
      const label = el.textContent || ''
      const id = el.id || `heading-${idx}`

      // Count line breaks before this element
      const beforeContent = htmlContent.substring(0, htmlContent.indexOf(el.outerHTML))
      lineNumber = beforeContent.split('\n').length

      headings.push({
        label,
        level,
        id,
        lineNumber
      })
    })
  } catch (err) {
    console.error('Failed to parse HTML for headings:', err)
  }

  return headings
}

/**
 * Get breadcrumb trail for current cursor position
 */
export function getBreadcrumbTrail(headings: BreadcrumbItem[], currentLineNumber: number): BreadcrumbItem[] {
  const trail: BreadcrumbItem[] = []
  let currentHeading: BreadcrumbItem | null = null

  for (const heading of headings) {
    if (heading.lineNumber <= currentLineNumber) {
      // Keep track of current heading at this level
      if (!currentHeading || heading.level > currentHeading.level) {
        currentHeading = heading
      }

      // Add to trail if it's a parent level
      if (!trail.length || heading.level <= trail[trail.length - 1].level) {
        // Remove items with equal or greater level
        while (trail.length && trail[trail.length - 1].level >= heading.level) {
          trail.pop()
        }
        trail.push(heading)
      }
    }
  }

  return trail
}

/**
 * Format breadcrumb for display
 */
export function formatBreadcrumb(trail: BreadcrumbItem[], separator: string = ' / '): string {
  return trail.map((item) => item.label || `Heading ${item.level}`).join(separator)
}

/**
 * Build hierarchical outline from headings
 */
export interface OutlineNode {
  heading: BreadcrumbItem
  children: OutlineNode[]
}

export function buildOutlineHierarchy(headings: BreadcrumbItem[]): OutlineNode[] {
  const root: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const heading of headings) {
    const node: OutlineNode = { heading, children: [] }

    // Find parent (last item with lower level)
    while (stack.length && stack[stack.length - 1].heading.level >= heading.level) {
      stack.pop()
    }

    if (stack.length === 0) {
      root.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }

    stack.push(node)
  }

  return root
}

/**
 * Flatten outline hierarchy for list rendering
 */
export function flattenOutlineHierarchy(nodes: OutlineNode[], depth: number = 0): Array<{ node: OutlineNode; depth: number }> {
  const flattened: Array<{ node: OutlineNode; depth: number }> = []

  for (const node of nodes) {
    flattened.push({ node, depth })
    flattened.push(...flattenOutlineHierarchy(node.children, depth + 1))
  }

  return flattened
}

/**
 * Scroll to heading/section
 */
export function scrollToHeading(headingId: string): void {
  const element = document.getElementById(headingId)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

/**
 * Sticky breadcrumb - get sticky breadcrumb items while scrolling
 */
export function getStickyBreadcrumbItems(
  headings: BreadcrumbItem[],
  scrollY: number,
  itemHeight: number
): BreadcrumbItem[] {
  return headings.filter((h) => h.lineNumber * itemHeight <= scrollY)
}
