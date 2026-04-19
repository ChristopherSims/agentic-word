/**
 * Type definitions for structured TipTap document operations
 * Provides a type-safe interface for AI agents to edit documents
 */

export type TiptapOp =
  | { type: 'insert_text'; text: string; pos?: number }
  | { type: 'replace_range'; from: number; to: number; text: string }
  | { type: 'add_heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'add_paragraph'; text: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'bold'; from: number; to: number }
  | { type: 'italic'; from: number; to: number }

export interface TiptapToolInput {
  ops: TiptapOp[]
}
