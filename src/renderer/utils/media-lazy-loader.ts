/**
 * Media Lazy Loader
 * Detects and lazy-loads images and media elements
 */

export interface LazyLoadConfig {
  rootMargin?: string // CSS-like string, default '50px'
  threshold?: number | number[] // 0-1, default 0
  callback?: (element: HTMLElement, imageUrl?: string) => void
}

export class MediaLazyLoader {
  private observer: IntersectionObserver | null = null
  private loadedElements = new Set<HTMLElement>()

  constructor(config?: LazyLoadConfig) {
    const rootMargin = config?.rootMargin ?? '50px'
    const threshold = config?.threshold ?? 0

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.loadElement(entry.target as HTMLElement, config?.callback)
          }
        })
      },
      {
        rootMargin,
        threshold
      }
    )
  }

  /**
   * Observe all images in a container
   */
  observeContainer(container: HTMLElement): void {
    const images = container.querySelectorAll('img[data-src], img[data-lazy]')
    images.forEach((img) => {
      if (this.observer && !this.loadedElements.has(img as HTMLElement)) {
        this.observer.observe(img)
      }
    })
  }

  /**
   * Observe single element
   */
  observeElement(element: HTMLElement): void {
    if (this.observer && !this.loadedElements.has(element)) {
      this.observer.observe(element)
    }
  }

  /**
   * Load element (fetch image/media)
   */
  private loadElement(element: HTMLElement, callback?: (el: HTMLElement, url?: string) => void): void {
    if (this.loadedElements.has(element)) return

    const img = element as HTMLImageElement
    const src = img.dataset.src || img.dataset.lazy

    if (src) {
      // Preload image
      const preload = new Image()
      preload.onload = () => {
        img.src = src
        img.removeAttribute('data-src')
        img.removeAttribute('data-lazy')
        img.classList.add('loaded')
        this.loadedElements.add(element)
        if (this.observer) this.observer.unobserve(element)
        callback?.(element, src)
      }
      preload.onerror = () => {
        console.warn(`Failed to load image: ${src}`)
        img.classList.add('load-error')
        this.loadedElements.add(element)
        if (this.observer) this.observer.unobserve(element)
      }
      preload.src = src
    } else {
      callback?.(element)
    }
  }

  /**
   * Unobserve element
   */
  unobserveElement(element: HTMLElement): void {
    if (this.observer) {
      this.observer.unobserve(element)
    }
  }

  /**
   * Get load percentage (loaded / total)
   */
  getLoadProgress(container: HTMLElement): { loaded: number; total: number } {
    const total = container.querySelectorAll('img[data-src], img[data-lazy]').length
    const loaded = container.querySelectorAll('img[data-src].loaded, img[data-lazy].loaded').length
    return { loaded, total }
  }

  /**
   * Wait for all images to load
   */
  async waitForAll(container: HTMLElement, timeout: number = 30000): Promise<boolean> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      const { loaded, total } = this.getLoadProgress(container)
      if (total === 0 || loaded === total) {
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return false
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    this.loadedElements.clear()
  }
}

/**
 * Singleton instance
 */
let loader: MediaLazyLoader | null = null

export function getMediaLazyLoader(config?: LazyLoadConfig): MediaLazyLoader {
  if (!loader) {
    loader = new MediaLazyLoader(config)
  }
  return loader
}

/**
 * React hook for lazy loading images
 */
export function useLazyLoadImages(containerRef: React.RefObject<HTMLElement>, config?: LazyLoadConfig) {
  React.useEffect(() => {
    if (!containerRef.current) return

    const loader = getMediaLazyLoader(config)
    loader.observeContainer(containerRef.current)

    return () => {
      // Don't destroy global loader, just stop observing
    }
  }, [containerRef, config])
}
