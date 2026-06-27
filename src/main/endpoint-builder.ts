/**
 * Endpoint builder — constructs provider-specific chat URLs and request bodies.
 */

import { type ProviderDef } from '../shared/providers'

export interface ChatOptions {
  temperature?: number
  maxTokens?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function buildChatEndpoint(
  provider: ProviderDef,
  baseUrl: string,
  model: string,
  ollamaFormat?: boolean
): string {
  // Ollama native format
  if (provider.ollamaNative && ollamaFormat) {
    return `${baseUrl}/api/chat`
  }

  // Ollama OpenAI-compatible mode
  if (provider.ollamaNative && !ollamaFormat) {
    return `${baseUrl}${provider.openaiCompatPath || '/v1/chat/completions'}`
  }

  // Providers with model name in the URL (Gemini)
  if (provider.chatPath.includes('{model}')) {
    return `${baseUrl}${provider.chatPath.replace('{model}', model)}`
  }

  // Standard path
  return `${baseUrl}${provider.chatPath}`
}

export function buildChatRequest(
  provider: ProviderDef,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions
): Record<string, unknown> {
  // Anthropic uses different field names
  if (provider.id === 'anthropic') {
    const systemMsg = messages.find(m => m.role === 'system')
    const nonSystem = messages.filter(m => m.role !== 'system')
    return {
      model,
      messages: nonSystem.map(m => ({ role: m.role, content: m.content })),
      max_tokens: options.maxTokens ?? 4096,
      ...(systemMsg ? { system: systemMsg.content } : {}),
      temperature: options.temperature ?? 0.7,
    }
  }

  // Gemini uses different structure
  if (provider.id === 'gemini') {
    return {
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      }
    }
  }

  // Standard OpenAI-compatible format
  return {
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  }
}
