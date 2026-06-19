import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/app-store'

/**
 * Proactive Agent — watches document content changes and after a period
 * of idle + significant change, offers contextual suggestions.
 */
export function useProactiveAgent() {
  const documentContent = useAppStore((s) => s.documentContent)
  const chatLoading = useAppStore((s) => s.chatLoading)
  const addToast = useAppStore((s) => s.addToast)
  const addChatMessage = useAppStore((s) => s.addChatMessage)
  const setChatLoading = useAppStore((s) => s.setChatLoading)
  const setChatSidebarOpen = useAppStore((s) => s.setChatSidebarOpen)
  const currentBranch = useAppStore((s) => s.currentBranch)

  const lastContentRef = useRef('')
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSuggestionRef = useRef(0)

  useEffect(() => {
    if (chatLoading) return // Don't interrupt while agent is working
    if (!documentContent || documentContent.length < 500) return // Not enough content

    // Reset idle timer on content change
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)

    const textContent = documentContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const lastText = lastContentRef.current.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    // Only trigger if significant change (>200 new chars) and cooldown passed (2 min)
    const newChars = textContent.length - lastText.length
    const cooldown = Date.now() - lastSuggestionRef.current < 120_000

    if (newChars < 200 || cooldown) {
      lastContentRef.current = documentContent
      return
    }

    // Start idle timer — after 30s of no typing, analyze
    idleTimerRef.current = setTimeout(async () => {
      lastContentRef.current = documentContent
      lastSuggestionRef.current = Date.now()

      try {
        const snippet = textContent.slice(-3000) // Analyze last ~3000 chars
        const response = await fetch(`${useAppStore.getState().agentConfig.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: useAppStore.getState().agentConfig.model,
            messages: [
              {
                role: 'system',
                content: `You are a writing assistant analyzing a document in real-time. The user has been writing and you notice they might need help. Based on the content, suggest ONE specific, helpful action (e.g., "Draft a conclusion", "Add transition between sections", "Check for consistency", "Suggest a better opening").

Return ONLY a JSON object: {"suggestion": "your brief suggestion", "action": "one-line prompt to send to the agent"}. If no help is needed, return {"suggestion": ""}.`
              },
              { role: 'user', content: snippet }
            ],
            temperature: 0.3,
            stream: false
          })
        })

        if (!response.ok) return
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content || data.message?.content || ''
        const json = JSON.parse(content)
        if (!json.suggestion) return

        // Show suggestion toast with action button
        addToast('info', `💡 ${json.suggestion}`)
        addChatMessage({ id: crypto.randomUUID(), role: 'assistant' as const, content: `💡 I noticed you might want: **${json.suggestion}** — want me to do that?` })

        // Auto-execute if user hasn't dismissed after 10s? No — let them click.
      } catch {
        // Best-effort — skip if analysis fails
      }
    }, 30_000)

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [documentContent, chatLoading])
}
