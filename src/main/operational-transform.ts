/**
 * Operational Transform Engine for Collaborative Editing
 * Implements OT algorithm for conflict-free collaborative text editing
 * Handles concurrent edits from multiple users with automatic resolution
 */

interface Operation {
  id: string
  userId: string
  type: 'insert' | 'delete'
  position: number
  content?: string
  length?: number
  timestamp: number
  version: number
}

interface TransformResult {
  operation: Operation
  transformedAgainstCount: number
  conflicts: number
}

interface OperationHistory {
  operations: Operation[]
  version: number
  lastAppliedVersion: number
}

class OperationalTransform {
  private operationHistory: OperationHistory = {
    operations: [],
    version: 0,
    lastAppliedVersion: 0,
  }
  private pendingOperations: Map<string, Operation[]> = new Map()

  /**
   * Create insert operation
   */
  createInsertOperation(
    userId: string,
    position: number,
    content: string,
    version: number
  ): Operation {
    return {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type: 'insert',
      position,
      content,
      timestamp: Date.now(),
      version,
    }
  }

  /**
   * Create delete operation
   */
  createDeleteOperation(
    userId: string,
    position: number,
    length: number,
    version: number
  ): Operation {
    return {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      type: 'delete',
      position,
      length,
      timestamp: Date.now(),
      version,
    }
  }

  /**
   * Transform operation against another using OT algorithm
   * Adjusts position based on prior operations
   */
  transform(operation: Operation, against: Operation[]): TransformResult {
    let transformedOp = { ...operation }
    let transformedAgainstCount = 0
    let conflicts = 0

    for (const priorOp of against) {
      const result = this.transformAgainstSingle(transformedOp, priorOp)
      transformedOp = result.operation
      transformedAgainstCount++

      if (result.conflict) {
        conflicts++
      }
    }

    return { operation: transformedOp, transformedAgainstCount, conflicts }
  }

  /**
   * Transform single operation against another
   */
  private transformAgainstSingle(
    op: Operation,
    priorOp: Operation
  ): { operation: Operation; conflict: boolean } {
    const transformedOp = { ...op }
    let conflict = false

    // Insert vs Insert
    if (op.type === 'insert' && priorOp.type === 'insert') {
      if (priorOp.position < op.position) {
        transformedOp.position += priorOp.content!.length
      } else if (priorOp.position === op.position) {
        // Tie-break by user ID
        if (priorOp.userId < op.userId) {
          transformedOp.position += priorOp.content!.length
        }
        conflict = true
      }
    }
    // Insert vs Delete
    else if (op.type === 'insert' && priorOp.type === 'delete') {
      if (priorOp.position < op.position) {
        transformedOp.position -= priorOp.length!
      } else if (priorOp.position >= op.position) {
        // No change, prior delete is after insert position
      }
    }
    // Delete vs Insert
    else if (op.type === 'delete' && priorOp.type === 'insert') {
      if (priorOp.position < op.position) {
        transformedOp.position += priorOp.content!.length
      } else if (priorOp.position < op.position + op.length!) {
        transformedOp.length! -= priorOp.content!.length
        conflict = true
      }
    }
    // Delete vs Delete
    else if (op.type === 'delete' && priorOp.type === 'delete') {
      if (priorOp.position < op.position) {
        transformedOp.position -= priorOp.length!
      } else if (priorOp.position < op.position + op.length!) {
        const overlap = Math.min(
          op.position + op.length! - priorOp.position,
          priorOp.length!
        )
        transformedOp.length! -= overlap
        conflict = true
      }
    }

    return { operation: transformedOp, conflict }
  }

  /**
   * Apply operation to document state
   */
  applyOperation(
    documentState: string,
    operation: Operation
  ): { state: string; success: boolean } {
    try {
      if (operation.type === 'insert') {
        const state =
          documentState.slice(0, operation.position) +
          operation.content +
          documentState.slice(operation.position)
        return { state, success: true }
      } else if (operation.type === 'delete') {
        const state =
          documentState.slice(0, operation.position) +
          documentState.slice(operation.position + operation.length!)
        return { state, success: true }
      }
    } catch (error) {
      console.error('Failed to apply operation:', error)
    }

    return { state: documentState, success: false }
  }

  /**
   * Add operation to history
   */
  addOperation(operation: Operation): void {
    operation.version = this.operationHistory.version
    this.operationHistory.operations.push(operation)
    this.operationHistory.version++
  }

  /**
   * Get operations since version
   */
  getOperationsSinceVersion(version: number): Operation[] {
    return this.operationHistory.operations.filter((op) => op.version >= version)
  }

  /**
   * Store pending operations for user
   */
  setPendingOperations(userId: string, operations: Operation[]): void {
    this.pendingOperations.set(userId, operations)
  }

  /**
   * Get pending operations for user
   */
  getPendingOperations(userId: string): Operation[] {
    return this.pendingOperations.get(userId) || []
  }

  /**
   * Clear pending operations for user
   */
  clearPendingOperations(userId: string): void {
    this.pendingOperations.delete(userId)
  }

  /**
   * Get current document version
   */
  getVersion(): number {
    return this.operationHistory.version
  }

  /**
   * Get operation history
   */
  getHistory(): Operation[] {
    return [...this.operationHistory.operations]
  }

  /**
   * Get last applied version
   */
  getLastAppliedVersion(): number {
    return this.operationHistory.lastAppliedVersion
  }

  /**
   * Set last applied version
   */
  setLastAppliedVersion(version: number): void {
    this.operationHistory.lastAppliedVersion = version
  }

  /**
   * Compact history (keep only recent operations)
   */
  compactHistory(keepLastNVersions: number): void {
    const startIndex = Math.max(
      0,
      this.operationHistory.operations.length - keepLastNVersions
    )
    this.operationHistory.operations =
      this.operationHistory.operations.slice(startIndex)
  }

  /**
   * Check for conflicts between operations
   */
  detectConflict(op1: Operation, op2: Operation): boolean {
    // Insert/Insert conflict
    if (op1.type === 'insert' && op2.type === 'insert') {
      return op1.position === op2.position && op1.userId !== op2.userId
    }

    // Insert/Delete conflict
    if (op1.type === 'insert' && op2.type === 'delete') {
      return (
        op1.position >= op2.position &&
        op1.position < op2.position + op2.length!
      )
    }

    // Delete/Insert conflict
    if (op1.type === 'delete' && op2.type === 'insert') {
      return (
        op2.position >= op1.position &&
        op2.position < op1.position + op1.length!
      )
    }

    // Delete/Delete conflict
    if (op1.type === 'delete' && op2.type === 'delete') {
      return (
        op1.position < op2.position + op2.length! &&
        op2.position < op1.position + op1.length!
      )
    }

    return false
  }

  /**
   * Resolve conflict with strategy
   */
  resolveConflict(
    op1: Operation,
    op2: Operation,
    strategy: 'timestamp' | 'userId' | 'priority'
  ): { winner: Operation; loser: Operation } {
    let winner: Operation
    let loser: Operation

    switch (strategy) {
      case 'timestamp':
        if (op1.timestamp < op2.timestamp) {
          winner = op1
          loser = op2
        } else {
          winner = op2
          loser = op1
        }
        break

      case 'userId':
        if (op1.userId < op2.userId) {
          winner = op1
          loser = op2
        } else {
          winner = op2
          loser = op1
        }
        break

      case 'priority':
      default:
        // User-configurable priority (could be based on user role, etc.)
        winner = op1
        loser = op2
    }

    return { winner, loser }
  }
}

export default new OperationalTransform()
export { OperationalTransform, Operation, TransformResult, OperationHistory }
