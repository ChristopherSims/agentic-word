/**
 * OAuth Authentication Service
 * Handles OAuth 2.0 flows for cloud storage providers
 */

import { BrowserWindow, ipcMain } from 'electron'
import * as crypto from 'crypto'

export interface OAuthProvider {
  name: 'google-drive' | 'dropbox' | 'onedrive' | 'webdav'
  clientId: string
  clientSecret: string
  redirectUri: string
  authUrl: string
  tokenUrl: string
}

export interface AuthToken {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  provider: string
}

export class OAuthService {
  private tokens: Map<string, AuthToken> = new Map()
  private providers: Map<string, OAuthProvider> = new Map()
  private pendingAuth: Map<string, { resolve: (token: AuthToken) => void; reject: (error: Error) => void }> = new Map()

  constructor() {
    this.initializeProviders()
    this.loadTokensFromStorage()
  }

  private initializeProviders(): void {
    // Google Drive OAuth
    this.providers.set('google-drive', {
      name: 'google-drive',
      clientId: process.env.VITE_GOOGLE_CLIENT_ID || 'your-google-client-id.apps.googleusercontent.com',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: 'http://localhost:3000/auth/google-callback',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token'
    })

    // Dropbox OAuth
    this.providers.set('dropbox', {
      name: 'dropbox',
      clientId: process.env.VITE_DROPBOX_CLIENT_ID || 'your-dropbox-app-key',
      clientSecret: process.env.DROPBOX_CLIENT_SECRET || '',
      redirectUri: 'http://localhost:3000/auth/dropbox-callback',
      authUrl: 'https://www.dropbox.com/oauth2/authorize',
      tokenUrl: 'https://api.dropboxapi.com/oauth2/token'
    })

    // OneDrive OAuth
    this.providers.set('onedrive', {
      name: 'onedrive',
      clientId: process.env.VITE_ONEDRIVE_CLIENT_ID || 'your-onedrive-client-id',
      clientSecret: process.env.ONEDRIVE_CLIENT_SECRET || '',
      redirectUri: 'http://localhost:3000/auth/onedrive-callback',
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
    })

    // WebDAV (custom servers don't use OAuth but basic auth)
    this.providers.set('webdav', {
      name: 'webdav',
      clientId: 'webdav',
      clientSecret: '',
      redirectUri: '',
      authUrl: '',
      tokenUrl: ''
    })
  }

  /**
   * Start OAuth flow for a provider
   */
  async startOAuthFlow(provider: string, mainWindow: BrowserWindow): Promise<AuthToken> {
    const providerConfig = this.providers.get(provider)
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`)
    }

    // Generate state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex')
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      redirect_uri: providerConfig.redirectUri,
      response_type: 'code',
      scope: this.getScope(provider),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    })

    const authUrl = `${providerConfig.authUrl}?${params.toString()}`

    // Open auth window
    const authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      show: true,
      parent: mainWindow,
      modal: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    return new Promise((resolve, reject) => {
      // Store pending auth
      this.pendingAuth.set(provider, { resolve, reject })

      authWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith(providerConfig.redirectUri)) {
          event.preventDefault()
          authWindow.close()

          const authCode = new URL(url).searchParams.get('code')
          const returnedState = new URL(url).searchParams.get('state')

          if (!authCode || returnedState !== state) {
            reject(new Error('OAuth state mismatch or missing code'))
            return
          }

          // Exchange code for token
          this.exchangeCodeForToken(provider, authCode, codeVerifier)
            .then((token) => {
              this.tokens.set(provider, token)
              this.saveTokensToStorage()
              resolve(token)
            })
            .catch(reject)
        }
      })

      authWindow.webContents.on('did-fail-load', () => {
        reject(new Error('Failed to load OAuth page'))
      })

      authWindow.loadURL(authUrl)
    })
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(provider: string, code: string, codeVerifier: string): Promise<AuthToken> {
    const providerConfig = this.providers.get(provider)
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`)
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      redirect_uri: providerConfig.redirectUri,
      code_verifier: codeVerifier
    })

    try {
      const response = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      })

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`)
      }

      const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
        provider
      }
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${(error as Error).message}`)
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(provider: string): Promise<AuthToken> {
    const token = this.tokens.get(provider)
    if (!token?.refreshToken) {
      throw new Error(`No refresh token available for ${provider}`)
    }

    const providerConfig = this.providers.get(provider)
    if (!providerConfig) {
      throw new Error(`Unknown provider: ${provider}`)
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret
    })

    try {
      const response = await fetch(providerConfig.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      })

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`)
      }

      const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number }

      const refreshedToken: AuthToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || token.refreshToken,
        expiresAt: data.expires_in ? Date.now() + (data.expires_in * 1000) : undefined,
        provider
      }

      this.tokens.set(provider, refreshedToken)
      this.saveTokensToStorage()

      return refreshedToken
    } catch (error) {
      throw new Error(`Failed to refresh token: ${(error as Error).message}`)
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken(provider: string): Promise<string> {
    let token = this.tokens.get(provider)
    if (!token) {
      throw new Error(`No token available for ${provider}`)
    }

    // Check if token is expired and needs refresh
    if (token.expiresAt && Date.now() > token.expiresAt - 60000) { // 1 minute buffer
      if (token.refreshToken) {
        token = await this.refreshToken(provider)
      } else {
        throw new Error(`Token expired and no refresh token available for ${provider}`)
      }
    }

    return token.accessToken
  }

  /**
   * Check if provider is authenticated
   */
  isAuthenticated(provider: string): boolean {
    return this.tokens.has(provider)
  }

  /**
   * Disconnect provider (revoke token)
   */
  async disconnect(provider: string): Promise<void> {
    this.tokens.delete(provider)
    this.saveTokensToStorage()
  }

  /**
   * Get all authenticated providers
   */
  getAuthenticatedProviders(): string[] {
    return Array.from(this.tokens.keys())
  }

  /**
   * Get OAuth scope for provider
   */
  private getScope(provider: string): string {
    switch (provider) {
      case 'google-drive':
        return 'https://www.googleapis.com/auth/drive.file'
      case 'dropbox':
        return 'files.content.read files.content.write files.metadata.read'
      case 'onedrive':
        return 'offline_access Files.ReadWrite.All'
      default:
        return ''
    }
  }

  /**
   * Save tokens to secure storage
   */
  private saveTokensToStorage(): void {
    try {
      const data: Record<string, AuthToken> = {}
      for (const [key, token] of this.tokens) {
        data[key] = token
      }
      // In production, use electron-secure-storage or similar
      const storageDir = require('electron').app.getPath('userData')
      const fs = require('fs')
      fs.writeFileSync(`${storageDir}/.auth-tokens`, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save tokens:', error)
    }
  }

  /**
   * Load tokens from secure storage
   */
  private loadTokensFromStorage(): void {
    try {
      const storageDir = require('electron').app.getPath('userData')
      const fs = require('fs')
      const path = `${storageDir}/.auth-tokens`
      if (fs.existsSync(path)) {
        const data = JSON.parse(fs.readFileSync(path, 'utf-8')) as Record<string, AuthToken>
        for (const [key, token] of Object.entries(data)) {
          this.tokens.set(key, token)
        }
      }
    } catch (error) {
      console.error('Failed to load tokens:', error)
    }
  }
}

// Export singleton
export const oauthService = new OAuthService()
