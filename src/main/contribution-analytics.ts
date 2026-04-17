/**
 * Contribution Analytics Service
 * Tracks user contributions, edits, comments, and collaboration metrics
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface UserContribution {
  userId: string
  userName: string
  email: string
  insertCount: number
  deleteCount: number
  charInserted: number
  charDeleted: number
  commentCount: number
  suggestionsAccepted: number
  suggestionsRejected: number
  lastEditTime: number
  firstEditTime: number
  sessionCount: number
  totalTimeEditing: number // in milliseconds
}

interface ContributionMetrics {
  userId: string
  wordsAdded: number
  wordsRemoved: number
  editsPerHour: number
  commentsPerEdit: number
  suggestionAcceptanceRate: number
  averageSessionDuration: number
  mostActiveHour: number
  contributionPercentage: number
}

interface SessionSummary {
  sessionId: string
  userId: string
  startTime: number
  endTime: number
  duration: number
  operationsCount: number
  wordsAdded: number
  wordsRemoved: number
  commentsAdded: number
  suggestionsReceived: number
  suggestionsAccepted: number
}

class ContributionAnalytics {
  private static instance: ContributionAnalytics
  private contributions: Map<string, UserContribution> = new Map()
  private sessions: SessionSummary[] = []
  private currentSession: Map<string, SessionSummary> = new Map()
  private storageDir = app.getPath('userData')
  private dataFilePath = path.join(this.storageDir, 'contribution-analytics.json')

  private constructor() {
    this.loadFromStorage()
  }

  static getInstance(): ContributionAnalytics {
    if (!ContributionAnalytics.instance) {
      ContributionAnalytics.instance = new ContributionAnalytics()
    }
    return ContributionAnalytics.instance
  }

  /**
   * Start tracking user session
   */
  startSession(userId: string, userName: string): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const session: SessionSummary = {
      sessionId,
      userId,
      startTime: Date.now(),
      endTime: 0,
      duration: 0,
      operationsCount: 0,
      wordsAdded: 0,
      wordsRemoved: 0,
      commentsAdded: 0,
      suggestionsReceived: 0,
      suggestionsAccepted: 0,
    }

    this.currentSession.set(userId, session)

    // Initialize user contribution if not exists
    if (!this.contributions.has(userId)) {
      this.contributions.set(userId, {
        userId,
        userName,
        email: '',
        insertCount: 0,
        deleteCount: 0,
        charInserted: 0,
        charDeleted: 0,
        commentCount: 0,
        suggestionsAccepted: 0,
        suggestionsRejected: 0,
        lastEditTime: Date.now(),
        firstEditTime: Date.now(),
        sessionCount: 1,
        totalTimeEditing: 0,
      })
    } else {
      const contrib = this.contributions.get(userId)!
      contrib.sessionCount++
      contrib.lastEditTime = Date.now()
    }

    return sessionId
  }

  /**
   * End user session
   */
  endSession(userId: string): SessionSummary | null {
    const session = this.currentSession.get(userId)
    if (!session) return null

    session.endTime = Date.now()
    session.duration = session.endTime - session.startTime

    this.sessions.push(session)

    // Update user contribution
    const contrib = this.contributions.get(userId)
    if (contrib) {
      contrib.totalTimeEditing += session.duration
    }

    this.currentSession.delete(userId)
    this.saveToStorage()

    return session
  }

  /**
   * Record insert operation
   */
  recordInsert(
    userId: string,
    charCount: number,
    wordCount: number = 0
  ): void {
    const contrib = this.contributions.get(userId)
    if (!contrib) return

    contrib.insertCount++
    contrib.charInserted += charCount

    const session = this.currentSession.get(userId)
    if (session) {
      session.operationsCount++
      session.wordsAdded += wordCount
    }

    this.saveToStorage()
  }

  /**
   * Record delete operation
   */
  recordDelete(userId: string, charCount: number, wordCount: number = 0): void {
    const contrib = this.contributions.get(userId)
    if (!contrib) return

    contrib.deleteCount++
    contrib.charDeleted += charCount

    const session = this.currentSession.get(userId)
    if (session) {
      session.operationsCount++
      session.wordsRemoved += wordCount
    }

    this.saveToStorage()
  }

  /**
   * Record comment
   */
  recordComment(userId: string): void {
    const contrib = this.contributions.get(userId)
    if (!contrib) return

    contrib.commentCount++

    const session = this.currentSession.get(userId)
    if (session) {
      session.commentsAdded++
    }

    this.saveToStorage()
  }

  /**
   * Record suggestion response
   */
  recordSuggestionResponse(
    userId: string,
    accepted: boolean
  ): void {
    const contrib = this.contributions.get(userId)
    if (!contrib) return

    if (accepted) {
      contrib.suggestionsAccepted++
    } else {
      contrib.suggestionsRejected++
    }

    const session = this.currentSession.get(userId)
    if (session) {
      if (accepted) {
        session.suggestionsAccepted++
      }
    }

    this.saveToStorage()
  }

  /**
   * Get user contribution
   */
  getUserContribution(userId: string): UserContribution | null {
    return this.contributions.get(userId) || null
  }

  /**
   * Get all contributions
   */
  getAllContributions(): UserContribution[] {
    return Array.from(this.contributions.values())
  }

  /**
   * Calculate contribution metrics
   */
  calculateMetrics(userId: string): ContributionMetrics | null {
    const contrib = this.contributions.get(userId)
    if (!contrib) return null

    const totalSuggestions =
      contrib.suggestionsAccepted + contrib.suggestionsRejected
    const suggestionAcceptanceRate =
      totalSuggestions > 0 ? contrib.suggestionsAccepted / totalSuggestions : 0

    const wordsAdded = Math.floor(contrib.charInserted / 5) // Rough estimate
    const wordsRemoved = Math.floor(contrib.charDeleted / 5)

    const hoursEditing = contrib.totalTimeEditing / (1000 * 60 * 60)
    const editsPerHour =
      hoursEditing > 0 ? contrib.insertCount + contrib.deleteCount / hoursEditing : 0

    const totalEdits = contrib.insertCount + contrib.deleteCount
    const commentsPerEdit =
      totalEdits > 0 ? contrib.commentCount / totalEdits : 0

    const sessions = this.sessions.filter((s) => s.userId === userId)
    const averageSessionDuration =
      sessions.length > 0
        ? sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length
        : 0

    // Most active hour (0-23)
    const hourCounts = new Array(24).fill(0)
    sessions.forEach((s) => {
      const hour = new Date(s.startTime).getHours()
      hourCounts[hour]++
    })
    const mostActiveHour = hourCounts.indexOf(Math.max(...hourCounts))

    // Contribution percentage (% of total edits)
    const totalAllContributions = Array.from(this.contributions.values()).reduce(
      (sum, c) => sum + c.insertCount + c.deleteCount,
      0
    )
    const contributionPercentage =
      totalAllContributions > 0
        ? ((contrib.insertCount + contrib.deleteCount) / totalAllContributions) * 100
        : 0

    return {
      userId,
      wordsAdded,
      wordsRemoved,
      editsPerHour,
      commentsPerEdit,
      suggestionAcceptanceRate,
      averageSessionDuration,
      mostActiveHour,
      contributionPercentage,
    }
  }

  /**
   * Get session history
   */
  getSessionHistory(userId?: string, limit: number = 100): SessionSummary[] {
    let sessions = this.sessions
    if (userId) {
      sessions = sessions.filter((s) => s.userId === userId)
    }
    return sessions.slice(-limit).reverse()
  }

  /**
   * Get contribution ranking
   */
  getContributionRanking(): UserContribution[] {
    return Array.from(this.contributions.values()).sort(
      (a, b) =>
        b.insertCount +
        b.deleteCount -
        (a.insertCount + a.deleteCount)
    )
  }

  /**
   * Get collaboration timeline
   */
  getCollaborationTimeline(
    startTime: number,
    endTime: number
  ): { timestamp: number; userId: string; action: string }[] {
    const timeline: { timestamp: number; userId: string; action: string }[] = []

    // Build timeline from sessions
    this.sessions.forEach((session) => {
      if (session.startTime >= startTime && session.endTime <= endTime) {
        timeline.push({
          timestamp: session.startTime,
          userId: session.userId,
          action: `started editing`,
        })

        if (session.operationsCount > 0) {
          timeline.push({
            timestamp:
              session.startTime +
              (session.duration / session.operationsCount) * session.operationsCount,
            userId: session.userId,
            action: `made ${session.operationsCount} edits (${session.wordsAdded} words added)`,
          })
        }

        if (session.commentsAdded > 0) {
          timeline.push({
            timestamp: session.endTime - 1000,
            userId: session.userId,
            action: `added ${session.commentsAdded} comments`,
          })
        }

        timeline.push({
          timestamp: session.endTime,
          userId: session.userId,
          action: `stopped editing`,
        })
      }
    })

    return timeline.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Clear all data (testing/reset)
   */
  clearAllData(): void {
    this.contributions.clear()
    this.sessions = []
    this.currentSession.clear()
    try {
      if (fs.existsSync(this.dataFilePath)) {
        fs.unlinkSync(this.dataFilePath)
      }
    } catch (error) {
      console.error('Failed to clear analytics data:', error)
    }
  }

  /**
   * Export analytics as JSON
   */
  exportAnalytics(): {
    contributions: UserContribution[]
    sessions: SessionSummary[]
    exportDate: string
  } {
    return {
      contributions: Array.from(this.contributions.values()),
      sessions: this.sessions,
      exportDate: new Date().toISOString(),
    }
  }

  /**
   * Save to storage
   */
  private saveToStorage(): void {
    const data = {
      contributions: Array.from(this.contributions.entries()),
      sessions: this.sessions,
    }
    try {
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('Failed to save analytics:', error)
    }
  }

  /**
   * Load from storage
   */
  private loadFromStorage(): void {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf-8'))
        this.contributions = new Map(data.contributions || [])
        this.sessions = data.sessions || []
      }
    } catch (error) {
      console.error('Failed to load analytics:', error)
    }
  }
}

export default ContributionAnalytics.getInstance()
export {
  ContributionAnalytics,
  UserContribution,
  ContributionMetrics,
  SessionSummary,
}
