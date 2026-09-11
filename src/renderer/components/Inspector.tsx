import React, { type FC } from 'react'
import { AgentWorkspacePanel } from './AgentWorkspacePanel'

/**
 * Docked right rail. Intentionally agent-only: comments, version control, and
 * document statistics are their own surfaces triggered from their own controls.
 */
export const Inspector: FC = () => <AgentWorkspacePanel embedded />
