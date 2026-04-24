/**
 * AI tool integration for structured TipTap document editing
 * Integrates with agent system to provide type-safe document operations
 */

import type { Editor } from '@tiptap/core'
import type { TiptapOp, TiptapToolInput } from '../../shared/tiptap-tool-types'
import { applyTiptapOps } from './tiptap-tool'

/**
 * Create a TipTap editing tool for AI agents
 * Returns a tool definition compatible with agent bridge registration
 */
export function createTiptapTool(editor: Editor) {
  return {
    name: 'edit_tiptap_document',
    description: 'Apply structured edits to the document using deterministic, reversible operations. Never write raw HTML.',
    parameters: {
      type: 'object' as const,
      properties: {
        ops: {
          type: 'array',
          description: 'Array of structured operations to apply to the document',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: [
                  'insert_text',
                  'replace_range',
                  'add_heading',
                  'add_paragraph',
                  'bullet_list',
                  'bold',
                  'italic'
                ],
                description: 'The type of operation to perform'
              },
              text: { type: 'string', description: 'Text content (for insert_text, add_heading, add_paragraph)' },
              pos: { type: 'number', description: 'Position to insert at (for insert_text, optional)' },
              from: { type: 'number', description: 'Start position (for replace_range, bold, italic)' },
              to: { type: 'number', description: 'End position (for replace_range, bold, italic)' },
              level: {
                type: 'number',
                enum: [1, 2, 3, 4, 5, 6],
                description: 'Heading level (for add_heading)'
              },
              items: {
                type: 'array',
                items: { type: 'string' },
                description: 'List items (for bullet_list)'
              }
            },
            required: ['type']
          }
        }
      },
      required: ['ops']
    },
    execute: async (input: unknown) => {
      try {
        // Validate input matches TiptapToolInput shape
        const parsed = input as TiptapToolInput
        
        if (!Array.isArray(parsed.ops)) {
          return {
            success: false,
            error: 'Input must contain ops array'
          }
        }

        // Apply operations to editor
        applyTiptapOps(editor, parsed)

        return {
          success: true,
          message: `Applied ${parsed.ops.length} operation${parsed.ops.length !== 1 ? 's' : ''} to document`
        }
      } catch (err) {
        return {
          success: false,
          error: `Failed to apply TipTap operations: ${(err as Error).message}`
        }
      }
    }
  }
}
