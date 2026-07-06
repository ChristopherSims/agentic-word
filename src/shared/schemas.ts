/**
 * Zod schemas for validating external JSON data.
 * Replaces unsafe `as Type` casts with runtime validation.
 */
import { z } from 'zod'

// ─── Agent Config ────────────────────────────────────────────

export const AgentConfigSchema = z.object({
  providerId: z.string().optional(),
  endpoint: z.string().url().or(z.literal('')).optional(),
  model: z.string().min(1).optional(),
  fastModel: z.string().optional(),
  smartModel: z.string().optional(),
  apiKey: z.string().optional(),
  providerApiKeys: z.record(z.string(), z.string()).optional(),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  tools: z.array(z.string()).optional(),
  toolChoice: z.enum(['auto', 'none', 'required']).optional(),
}).passthrough() // allow future fields without breaking

export type AgentConfig = z.infer<typeof AgentConfigSchema>

// ─── Backup Versions ─────────────────────────────────────────

export const BackupVersionSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  documentTitle: z.string(),
  documentContent: z.string(),
  size: z.number(),
  cloudProvider: z.string().optional(),
  version: z.string(),
  description: z.string().optional(),
})

export type BackupVersion = z.infer<typeof BackupVersionSchema>

// ─── Helper ──────────────────────────────────────────────────

/**
 * Parse JSON string and validate against a Zod schema.
 * Returns null on parse failure or validation failure (with console.error logging).
 */
export function parseConfig<T>(data: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = JSON.parse(data)
    const result = schema.safeParse(parsed)
    if (result.success) return result.data
    console.error('[Schema] Validation failed:', result.error.issues)
    return null
  } catch {
    console.error('[Schema] JSON parse failed')
    return null
  }
}
