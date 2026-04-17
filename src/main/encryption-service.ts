/**
 * Encryption Service for Document-Level Security
 * Handles document encryption/decryption with password support and key management
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface EncryptionKey {
  id: string
  algorithm: string
  publicKey?: CryptoKey
  privateKey?: CryptoKey
  format: 'raw' | 'pkcs8' | 'spki'
}

interface EncryptedDocument {
  id: string
  documentId: string
  title: string
  encryptedContent: string
  iv: string // Initialization Vector
  salt: string
  algorithm: 'AES-GCM' | 'AES-CBC'
  keyDerivation: 'PBKDF2' | 'Scrypt'
  timestamp: number
  isPasswordProtected: boolean
  keyId?: string
}

export class EncryptionService {
  private static instance: EncryptionService
  private encryptionKeys: Map<string, EncryptionKey> = new Map()
  private derivedKeys: Map<string, CryptoKey> = new Map()
  private storageDir = app.getPath('userData')
  private keysFilePath = path.join(this.storageDir, 'encryption-keys.json')
  private encryptedDocsDir = path.join(this.storageDir, 'encrypted-docs')
  private encryptedListPath = path.join(this.storageDir, 'encrypted-list.json')

  private constructor() {
    // Ensure encrypted docs directory exists
    if (!fs.existsSync(this.encryptedDocsDir)) {
      fs.mkdirSync(this.encryptedDocsDir, { recursive: true })
    }
    this.loadKeysFromStorage()
  }

  static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService()
    }
    return EncryptionService.instance
  }

  /**
   * Encrypt document content with password
   */
  async encryptDocument(
    documentId: string,
    title: string,
    content: string,
    password: string,
    algorithm: 'AES-GCM' | 'AES-CBC' = 'AES-GCM'
  ): Promise<EncryptedDocument> {
    try {
      // Generate random salt and IV
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const iv = crypto.getRandomValues(new Uint8Array(12))

      // Derive key from password
      const key = await this.deriveKey(password, salt)

      // Encode content
      const encoder = new TextEncoder()
      const data = encoder.encode(content)

      // Encrypt
      let encryptedData: ArrayBuffer
      if (algorithm === 'AES-GCM') {
        encryptedData = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          data
        )
      } else {
        encryptedData = await crypto.subtle.encrypt(
          { name: 'AES-CBC', iv },
          key,
          data
        )
      }

      // Convert to base64
      const encryptedContent = this.arrayBufferToBase64(encryptedData)
      const saltStr = this.arrayBufferToBase64(salt)
      const ivStr = this.arrayBufferToBase64(iv)

      const encrypted: EncryptedDocument = {
        id: `enc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        documentId,
        title,
        encryptedContent,
        iv: ivStr,
        salt: saltStr,
        algorithm,
        keyDerivation: 'PBKDF2',
        timestamp: Date.now(),
        isPasswordProtected: true,
      }

      // Store encrypted document
      this.saveEncryptedDocument(encrypted)

      return encrypted
    } catch (error) {
      console.error('Encryption failed:', error)
      throw new Error(`Failed to encrypt document: ${error}`)
    }
  }

  /**
   * Decrypt document with password
   */
  async decryptDocument(
    encrypted: EncryptedDocument,
    password: string
  ): Promise<string> {
    try {
      // Decode salt and IV
      const salt = this.base64ToArrayBuffer(encrypted.salt)
      const iv = this.base64ToArrayBuffer(encrypted.iv)
      const encryptedData = this.base64ToArrayBuffer(encrypted.encryptedContent)

      // Derive key from password
      const key = await this.deriveKey(password, salt)

      // Decrypt
      let decryptedData: ArrayBuffer
      if (encrypted.algorithm === 'AES-GCM') {
        decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          encryptedData
        )
      } else {
        decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-CBC', iv },
          key,
          encryptedData
        )
      }

      // Decode to string
      const decoder = new TextDecoder()
      return decoder.decode(decryptedData)
    } catch (error) {
      console.error('Decryption failed:', error)
      throw new Error(`Failed to decrypt document: Invalid password or corrupted data`)
    }
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  private async deriveKey(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    // Import password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    )

    // Derive key
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  /**
   * Generate RSA key pair for asymmetric encryption
   */
  async generateKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    )

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    }
  }

  /**
   * Get encryption key by ID
   */
  getKey(keyId: string): EncryptionKey | undefined {
    return this.encryptionKeys.get(keyId)
  }

  /**
   * Store encryption key
   */
  storeKey(key: EncryptionKey): void {
    this.encryptionKeys.set(key.id, key)
    this.saveKeysToStorage()
  }

  /**
   * Check if document is encrypted
   */
  isEncrypted(documentId: string): boolean {
    try {
      const docPath = path.join(this.encryptedDocsDir, `${documentId}.json`)
      return fs.existsSync(docPath)
    } catch (error) {
      console.error('Failed to check encrypted status:', error)
      return false
    }
  }

  /**
   * Get encrypted document metadata
   */
  getEncryptedDocument(documentId: string): EncryptedDocument | null {
    try {
      const docPath = path.join(this.encryptedDocsDir, `${documentId}.json`)
      if (fs.existsSync(docPath)) {
        const data = fs.readFileSync(docPath, 'utf-8')
        return JSON.parse(data)
      }
      return null
    } catch (error) {
      console.error('Failed to get encrypted document:', error)
      return null
    }
  }

  /**
   * Save encrypted document to storage
   */
  private saveEncryptedDocument(encrypted: EncryptedDocument): void {
    try {
      const docPath = path.join(this.encryptedDocsDir, `${encrypted.documentId}.json`)
      fs.writeFileSync(docPath, JSON.stringify(encrypted, null, 2))

      // Also store in list
      const list = this.getEncryptedDocumentsList()
      if (!list.find((e) => e.documentId === encrypted.documentId)) {
        list.push({
          documentId: encrypted.documentId,
          title: encrypted.title,
          timestamp: encrypted.timestamp,
          algorithm: encrypted.algorithm,
          isPasswordProtected: encrypted.isPasswordProtected,
        })
        fs.writeFileSync(this.encryptedListPath, JSON.stringify(list, null, 2))
      }
    } catch (error) {
      console.error('Failed to save encrypted document:', error)
    }
  }

  /**
   * Get list of encrypted documents
   */
  getEncryptedDocumentsList(): Array<{
    documentId: string
    title: string
    timestamp: number
    algorithm: string
    isPasswordProtected: boolean
  }> {
    try {
      if (fs.existsSync(this.encryptedListPath)) {
        const data = fs.readFileSync(this.encryptedListPath, 'utf-8')
        return JSON.parse(data)
      }
      return []
    } catch (error) {
      console.error('Failed to get encrypted documents list:', error)
      return []
    }
  }

  /**
   * Delete encrypted document
   */
  deleteEncryptedDocument(documentId: string): void {
    try {
      const docPath = path.join(this.encryptedDocsDir, `${documentId}.json`)
      if (fs.existsSync(docPath)) {
        fs.unlinkSync(docPath)
      }

      const list = this.getEncryptedDocumentsList()
      const filtered = list.filter((e) => e.documentId !== documentId)
      fs.writeFileSync(this.encryptedListPath, JSON.stringify(filtered, null, 2))
    } catch (error) {
      console.error('Failed to delete encrypted document:', error)
    }
  }

  /**
   * Encrypt backup
   */
  async encryptBackup(
    backupContent: string,
    password: string
  ): Promise<{ encrypted: string; salt: string; iv: string }> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const key = await this.deriveKey(password, salt)
    const data = new TextEncoder().encode(backupContent)

    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )

    return {
      encrypted: this.arrayBufferToBase64(encryptedData),
      salt: this.arrayBufferToBase64(salt),
      iv: this.arrayBufferToBase64(iv),
    }
  }

  /**
   * Decrypt backup
   */
  async decryptBackup(
    encrypted: string,
    salt: string,
    iv: string,
    password: string
  ): Promise<string> {
    const saltBuf = this.base64ToArrayBuffer(salt)
    const ivBuf = this.base64ToArrayBuffer(iv)
    const encryptedBuf = this.base64ToArrayBuffer(encrypted)

    const key = await this.deriveKey(password, saltBuf)

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuf },
      key,
      encryptedBuf
    )

    return new TextDecoder().decode(decryptedData)
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): {
    isStrong: boolean
    score: number
    feedback: string[]
  } {
    const feedback: string[] = []
    let score = 0

    if (password.length >= 12) {
      score += 2
    } else if (password.length >= 8) {
      score += 1
    } else {
      feedback.push('Use at least 8 characters')
    }

    if (/[A-Z]/.test(password)) {
      score += 1
    } else {
      feedback.push('Add uppercase letters')
    }

    if (/[a-z]/.test(password)) {
      score += 1
    } else {
      feedback.push('Add lowercase letters')
    }

    if (/[0-9]/.test(password)) {
      score += 1
    } else {
      feedback.push('Add numbers')
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      score += 1
    } else {
      feedback.push('Add special characters')
    }

    return {
      isStrong: score >= 4,
      score,
      feedback,
    }
  }

  /**
   * Save keys to storage
   */
  private saveKeysToStorage(): void {
    try {
      const keysData: Record<string, any> = {}

      for (const [id, key] of this.encryptionKeys) {
        keysData[id] = {
          id: key.id,
          algorithm: key.algorithm,
          format: key.format,
        }
      }

      fs.writeFileSync(this.keysFilePath, JSON.stringify(keysData, null, 2))
    } catch (error) {
      console.error('Failed to save encryption keys:', error)
    }
  }

  /**
   * Load keys from storage
   */
  private loadKeysFromStorage(): void {
    try {
      if (fs.existsSync(this.keysFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.keysFilePath, 'utf-8'))
        for (const [id, keyData] of Object.entries(data)) {
          this.encryptionKeys.set(id, keyData as EncryptionKey)
        }
      }
    } catch (error) {
      console.error('Failed to load encryption keys:', error)
    }
  }

  /**
   * Helper: Convert ArrayBuffer to Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  /**
   * Helper: Convert Base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }
}

export const encryptionService = EncryptionService.getInstance()
