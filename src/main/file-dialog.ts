import { dialog, BrowserWindow } from 'electron'

export interface FileDialogOptions {
  type: 'open' | 'save'
  title?: string
  filters?: { name: string; extensions: string[] }[]
  defaultPath?: string
}

/**
 * Open a native file dialog (open or save).
 * Returns the chosen file path, or null if cancelled.
 *
 * Usage:
 *   const filePath = await createFileDialog(mainWindow, { type: 'open', filters: [...], title: 'Open Document' })
 */
export async function createFileDialog(
  window: BrowserWindow,
  options: FileDialogOptions,
): Promise<string | null> {
  if (options.type === 'open') {
    const result = await dialog.showOpenDialog(window, {
      title: options.title,
      filters: options.filters,
      properties: ['openFile'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0]
    }
  } else {
    const result = await dialog.showSaveDialog(window, {
      title: options.title,
      filters: options.filters,
      defaultPath: options.defaultPath,
    })
    if (!result.canceled && result.filePath) {
      return result.filePath
    }
  }
  return null
}
