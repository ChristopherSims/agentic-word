// @vitest-environment jsdom
/**
 * §14 test tooling: renderer DOM tests for document binding and
 * approval/forget/context states, in an explicitly configured DOM
 * environment (jsdom), as the plan requires.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { MemoryPanel } from '../../src/renderer/components/MemoryPanel'
import { PrivacySettings } from '../../src/renderer/components/settings/PrivacySettings'
import type { AgentMemoryEntry } from '../../src/shared/types'

// React 19 act() needs this flag in non-react-test-renderer environments.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom lacks matchMedia, which MUI can query on mount.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }) as unknown as typeof window.matchMedia
}

// ─── Minimal typed mock of the preload agent API surface ───

const mockEntry = (overrides: Partial<AgentMemoryEntry>): AgentMemoryEntry => ({
  id: 'mem_1',
  documentId: 'doc-bound',
  agentName: 'Writer',
  type: 'preference',
  content: 'Prefer past tense in narrative prose',
  createdAt: 1_000,
  scope: 'document',
  approvalState: 'approved',
  ...overrides
})

const mocks = {
  memoryGet: vi.fn<(id: string) => Promise<AgentMemoryEntry[]>>(),
  memorySetApproval: vi.fn(),
  memoryDelete: vi.fn(),
  memoryForget: vi.fn(),
  memoryClear: vi.fn(),
  memoryUpdate: vi.fn(),
  memoryConsolidate: vi.fn(),
  memoryTemplate: vi.fn(),
  memoryQuarantine: vi.fn(),
  memoryQuarantineResolve: vi.fn(),
  memoryBackups: vi.fn(),
  memoryBackupRemove: vi.fn(),
  memoryMigrateSessions: vi.fn(),
  memoryRebuildProjections: vi.fn(),
  memoryPolicyGet: vi.fn(),
  consentGet: vi.fn(),
  consentSet: vi.fn(),
  mnesisStatus: vi.fn(),
  mnesisSetEnabled: vi.fn(),
  contextReports: vi.fn()
}

const installMocks = () => {
  mocks.memoryGet.mockResolvedValue([])
  mocks.memoryQuarantine.mockResolvedValue([])
  mocks.memoryBackups.mockResolvedValue([])
  mocks.mnesisStatus.mockResolvedValue(null)
  mocks.contextReports.mockResolvedValue([])
  mocks.memoryForget.mockResolvedValue({
    removedIds: ['mem_1'],
    suppressedCount: 1,
    projectionDisposed: true,
    projectionRebuilt: false
  })
  window.wordapp = { agent: mocks } as unknown as typeof window.wordapp
}

let root: Root | null = null
const render = async (ui: React.ReactElement): Promise<HTMLElement> => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(ui)
  })
  return container
}

beforeEach(() => {
  vi.clearAllMocks()
  installMocks()
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('MemoryPanel document binding and states (§14)', () => {
  it('binds to the explicit documentId prop, not the active tab', async () => {
    mocks.memoryGet.mockResolvedValue([mockEntry({ documentId: 'doc-bound' })])
    const container = await render(<MemoryPanel documentId="doc-bound" />)
    // The panel queried memory for the bound document id…
    expect(mocks.memoryGet).toHaveBeenCalledWith('doc-bound')
    expect(container.textContent).toContain('Prefer past tense in narrative prose')
    // …never for any other identity, no matter what the active tab is.
    for (const call of mocks.memoryGet.mock.calls) {
      expect(call[0]).toBe('doc-bound')
    }
  })

  it('candidate entries show approve/reject actions that set approval state', async () => {
    mocks.memoryGet.mockResolvedValue([mockEntry({ approvalState: 'candidate' })])
    const container = await render(<MemoryPanel documentId="doc-bound" />)
    // Buttons scoped to the entry card: approve (✓), reject (✕), edit, forget.
    const card = container.querySelector('.MuiCard-root')
    expect(card).not.toBeNull()
    const buttons = card!.querySelectorAll('button')
    expect(buttons.length).toBe(4)
    await act(async () => {
      buttons[0].click() // approve
    })
    expect(mocks.memorySetApproval).toHaveBeenCalledWith('mem_1', 'approved')
  })

  it('the delete action is the full §11 forget flow with an honest-limits notice', async () => {
    mocks.memoryGet.mockResolvedValue([mockEntry({ approvalState: 'approved' })])
    const container = await render(<MemoryPanel documentId="doc-bound" />)
    // Approved row buttons in the entry card: revoke, edit, forget (last),
    // carrying the §11 tooltip.
    const card = container.querySelector('.MuiCard-root')
    const buttons = card!.querySelectorAll('button')
    const forgetButton = buttons[buttons.length - 1]
    expect(forgetButton.getAttribute('aria-label')).toContain('Forget (§11)')
    await act(async () => {
      forgetButton.click()
    })
    // The §11 chain ran — not a bare ledger delete…
    expect(mocks.memoryForget).toHaveBeenCalledWith('mem_1')
    expect(mocks.memoryDelete).not.toHaveBeenCalled()
    // …and the honest-limits notice is shown afterwards.
    expect(container.textContent).toContain('did and did not erase')
    expect(container.textContent).toContain('NOT erased')
    expect(container.textContent).toContain('remote AI provider')
  })

  it('shows quarantined legacy records for review', async () => {
    mocks.memoryGet.mockResolvedValue([])
    mocks.memoryQuarantine.mockResolvedValue([
      { key: 'default', reason: 'default-key', record: { content: 'orphaned legacy preference' }, originKey: 'default' }
    ] as never)
    const container = await render(<MemoryPanel documentId="doc-bound" />)
    expect(container.textContent).toContain('Quarantined legacy memory')
    expect(container.textContent).toContain('orphaned legacy preference')
  })
})

describe('PrivacySettings consent surface (§11)', () => {
  it('renders all seven consent boundaries with descriptions', async () => {
    mocks.memoryPolicyGet.mockResolvedValue({ rejectedDays: null, candidateDays: null })
    mocks.consentGet.mockResolvedValue({
      retainLocalChatHistory: true,
      rememberDocumentFacts: true,
      automaticMemoryInference: true,
      backgroundSummarization: false,
      crossDocumentPreferences: true,
      shareMemoryWithCollaborators: false,
      remoteInference: true
    })
    const container = await render(<PrivacySettings />)
    const text = container.textContent ?? ''
    expect(text).toContain('1. Retain local chat history')
    expect(text).toContain('7. Send context to remote providers')
    // Off boundaries show their what-happens-when-off note.
    expect(text).toContain('The sidecar stays off')
  })

  it('toggling a boundary calls consentSet with that key only', async () => {
    mocks.memoryPolicyGet.mockResolvedValue({ rejectedDays: null, candidateDays: null })
    mocks.consentGet.mockResolvedValue({
      retainLocalChatHistory: true,
      rememberDocumentFacts: true,
      automaticMemoryInference: true,
      backgroundSummarization: false,
      crossDocumentPreferences: true,
      shareMemoryWithCollaborators: false,
      remoteInference: true
    })
    mocks.consentSet.mockResolvedValue({
      retainLocalChatHistory: false,
      rememberDocumentFacts: true,
      automaticMemoryInference: true,
      backgroundSummarization: false,
      crossDocumentPreferences: true,
      shareMemoryWithCollaborators: false,
      remoteInference: true
    })
    const container = await render(<PrivacySettings />)
    // Boundary 1's switch is the first switch in the consent section (after
    // the panel's own privacy switches — consent switches come last).
    const switches = container.querySelectorAll('input[type="checkbox"]')
    const consentSwitch = switches[switches.length - 7] // retainLocalChatHistory
    await act(async () => {
      consentSwitch.click()
    })
    expect(mocks.consentSet).toHaveBeenCalledWith({ retainLocalChatHistory: false })
    // Its whenOff note appears.
    expect(container.textContent).toContain('Chats are not persisted')
  })
})
