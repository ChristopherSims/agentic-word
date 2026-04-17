/**
 * Session History & Replay Service
 * Allows replaying collaborative sessions frame-by-frame
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface SessionEvent {
  eventId: string
  sessionId: string
  userId: string
  timestamp: number
  type: 'edit' | 'comment' | 'cursor' | 'presence' | 'suggestion'
  data: Record<string, any>
}

interface SessionSnapshot {
  snapshotId: string
  sessionId: string
  timestamp: number
  documentState: string
  presenceData: Record<string, any>
  cursorPositions: Record<string, number>
}

interface SessionRecording {
  sessionId: string
  userId: string
  startTime: number
  endTime: number
  events: SessionEvent[]
  snapshots: SessionSnapshot[]
  documentTitle: string
  documentId: string
}

class SessionHistoryService {
  private static instance: SessionHistoryService
  private recordings: Map<string, SessionRecording> = new Map()
  private currentRecording: SessionRecording | null = null
  private isRecording: boolean = false
  private storageDir = app.getPath('userData')
  private dataFilePath = path.join(this.storageDir, 'session-recordings.json')

  private constructor() {
    this.loadFromStorage()
  }

  static getInstance(): SessionHistoryService {
    if (!SessionHistoryService.instance) {
      SessionHistoryService.instance = new SessionHistoryService()
    }
    return SessionHistoryService.instance
  }

  /**
   * Start recording a session
   */
  startRecording(
    sessionId: string,
    userId: string,
    documentTitle: string,
    documentId: string
  ): SessionRecording {
    this.currentRecording = {
      sessionId,
      userId,
      startTime: Date.now(),
      endTime: 0,
      events: [],
      snapshots: [],
      documentTitle,
      documentId,
    }
    this.isRecording = true
    return this.currentRecording
  }

  /**
   * Stop recording session
   */
  stopRecording(): SessionRecording | null {
    if (!this.currentRecording) return null

    this.currentRecording.endTime = Date.now()
    this.recordings.set(this.currentRecording.sessionId, this.currentRecording)
    this.isRecording = false

    this.saveToStorage()
    return this.currentRecording
  }

  /**
   * Add event to current recording
   */
  recordEvent(
    type: 'edit' | 'comment' | 'cursor' | 'presence' | 'suggestion',
    userId: string,
    data: Record<string, any>
  ): void {
    if (!this.currentRecording) return

    const event: SessionEvent = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.currentRecording.sessionId,
      userId,
      timestamp: Date.now(),
      type,
      data,
    }

    this.currentRecording.events.push(event)
  }

  /**
   * Create snapshot at current state
   */
  createSnapshot(
    documentState: string,
    presenceData: Record<string, any>,
    cursorPositions: Record<string, number>
  ): SessionSnapshot | null {
    if (!this.currentRecording) return null

    const snapshot: SessionSnapshot = {
      snapshotId: `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.currentRecording.sessionId,
      timestamp: Date.now(),
      documentState,
      presenceData,
      cursorPositions,
    }

    this.currentRecording.snapshots.push(snapshot)
    return snapshot
  }

  /**
   * Get session recording
   */
  getRecording(sessionId: string): SessionRecording | null {
    return this.recordings.get(sessionId) || null
  }

  /**
   * Get all recordings
   */
  getAllRecordings(): SessionRecording[] {
    return Array.from(this.recordings.values())
  }

  /**
   * Get recordings by user
   */
  getRecordingsByUser(userId: string): SessionRecording[] {
    return Array.from(this.recordings.values()).filter((r) => r.userId === userId)
  }

  /**
   * Get recordings by document
   */
  getRecordingsByDocument(documentId: string): SessionRecording[] {
    return Array.from(this.recordings.values()).filter(
      (r) => r.documentId === documentId
    )
  }

  /**
   * Replay session frame by frame
   */
  replaySession(
    sessionId: string,
    frameRate: number = 30 // frames per second
  ): AsyncGenerator<SessionEvent, void, unknown> {
    const recording = this.recordings.get(sessionId)
    if (!recording) {
      throw new Error(`Recording not found: ${sessionId}`)
    }

    return this.generateReplayFrames(recording, frameRate)
  }

  /**
   * Generate replay frames
   */
  private async *generateReplayFrames(
    recording: SessionRecording,
    frameRate: number
  ): AsyncGenerator<SessionEvent, void, unknown> {
    const frameInterval = 1000 / frameRate
    let lastFrameTime = recording.startTime

    for (const event of recording.events) {
      const delay = event.timestamp - lastFrameTime
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
      yield event
      lastFrameTime = event.timestamp
    }
  }

  /**
   * Get replay state at timestamp
   */
  getReplayState(
    sessionId: string,
    timestamp: number
  ): { documentState: string; snapshot: SessionSnapshot | null } | null {
    const recording = this.recordings.get(sessionId)
    if (!recording) return null

    // Find closest snapshot before timestamp
    let relevantSnapshot: SessionSnapshot | null = null
    for (const snapshot of recording.snapshots) {
      if (snapshot.timestamp <= timestamp) {
        relevantSnapshot = snapshot
      }
    }

    return {
      documentState: relevantSnapshot?.documentState || '',
      snapshot: relevantSnapshot,
    }
  }

  /**
   * Get events between timestamps
   */
  getEventsBetween(
    sessionId: string,
    startTime: number,
    endTime: number
  ): SessionEvent[] {
    const recording = this.recordings.get(sessionId)
    if (!recording) return []

    return recording.events.filter(
      (e) => e.timestamp >= startTime && e.timestamp <= endTime
    )
  }

  /**
   * Export session as video frames data
   */
  exportSessionFrames(sessionId: string): { frames: string; metadata: string } {
    const recording = this.recordings.get(sessionId)
    if (!recording) throw new Error(`Recording not found: ${sessionId}`)

    const frames = JSON.stringify(recording.events, null, 2)
    const metadata = JSON.stringify(
      {
        sessionId: recording.sessionId,
        documentTitle: recording.documentTitle,
        documentId: recording.documentId,
        duration: recording.endTime - recording.startTime,
        eventCount: recording.events.length,
        startTime: recording.startTime,
        endTime: recording.endTime,
      },
      null,
      2
    )

    return { frames, metadata }
  }

  /**
   * Delete recording
   */
  deleteRecording(sessionId: string): boolean {
    if (this.currentRecording?.sessionId === sessionId) {
      this.currentRecording = null
      this.isRecording = false
    }
    return this.recordings.delete(sessionId)
  }

  /**
   * Delete all recordings for document
   */
  deleteDocumentRecordings(documentId: string): number {
    const toDelete = Array.from(this.recordings.keys()).filter((key) => {
      const recording = this.recordings.get(key)
      return recording?.documentId === documentId
    })

    toDelete.forEach((key) => this.recordings.delete(key))
    return toDelete.length
  }

  /**
   * Get session duration
   */
  getSessionDuration(sessionId: string): number | null {
    const recording = this.recordings.get(sessionId)
    if (!recording) return null
    return recording.endTime - recording.startTime
  }

  /**
   * Get event count
   */
  getEventCount(sessionId: string): number | null {
    const recording = this.recordings.get(sessionId)
    if (!recording) return null
    return recording.events.length
  }

  /**
   * Check if currently recording
   */
  isCurrentlyRecording(): boolean {
    return this.isRecording && this.currentRecording !== null
  }

  /**
   * Get current recording
   */
  getCurrentRecording(): SessionRecording | null {
    return this.currentRecording
  }

  /**
   * Clear all recordings (testing/reset)
   */
  clearAllRecordings(): void {
    this.recordings.clear()
    this.currentRecording = null
    this.isRecording = false
    try {
      if (fs.existsSync(this.dataFilePath)) {
        fs.unlinkSync(this.dataFilePath)
      }
    } catch (error) {
      console.error('Failed to clear session recordings:', error)
    }
  }

  /**
   * Save to storage
   */
  private saveToStorage(): void {
    const data = {
      recordings: Array.from(this.recordings.entries()),
    }
    try {
      fs.writeFileSync(this.dataFilePath, JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('Failed to save session recordings:', error)
    }
  }

  /**
   * Load from storage
   */
  private loadFromStorage(): void {
    try {
      if (fs.existsSync(this.dataFilePath)) {
        const data = JSON.parse(fs.readFileSync(this.dataFilePath, 'utf-8'))
        const recordingsArray = data.recordings || []
        this.recordings = new Map(recordingsArray)
      }
    } catch (error) {
      console.error('Failed to load session recordings:', error)
    }
  }
}

export default SessionHistoryService.getInstance()
export {
  SessionHistoryService,
  SessionEvent,
  SessionSnapshot,
  SessionRecording,
}
