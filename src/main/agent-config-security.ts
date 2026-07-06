export const SAFE_STORAGE_PREFIX = '__SAFESTORAGE__:'

export function encodeSafeStorageValue(encrypted: Buffer): string {
  return SAFE_STORAGE_PREFIX + encrypted.toString('hex')
}

export function decodeSafeStorageValue(value: string): Buffer {
  if (!value.startsWith(SAFE_STORAGE_PREFIX)) {
    throw new Error('Value is not safeStorage encoded')
  }
  return Buffer.from(value.slice(SAFE_STORAGE_PREFIX.length), 'hex')
}

export function removeUndefinedValues<T extends object>(value: T): Partial<T> {
  const sanitized: Partial<T> = {}
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue !== undefined) {
      ;(sanitized as Record<string, unknown>)[key] = entryValue
    }
  }
  return sanitized
}
