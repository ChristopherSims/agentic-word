/**
 * Service container for dependency injection.
 * Provides consistent singleton access to all main-process services.
 */

import { DocumentStore } from './document-store'
import { VcsEngine } from './vcs-engine'
import { AgentBridge } from './agent-bridge'
import { PluginEngine } from './plugin-engine'
import { BackupService } from './backup-service'

export class ServiceContainer {
  readonly docStore: DocumentStore
  readonly vcsEngine: VcsEngine
  readonly agentBridge: AgentBridge
  readonly pluginEngine: PluginEngine
  readonly backupService: BackupService

  constructor() {
    this.docStore = new DocumentStore()
    this.vcsEngine = new VcsEngine()
    this.pluginEngine = new PluginEngine()
    this.backupService = new BackupService()
    // AgentBridge depends on VcsEngine and DocumentStore
    this.agentBridge = new AgentBridge(this.vcsEngine, this.docStore)
  }
}

let _container: ServiceContainer | null = null

export function getServiceContainer(): ServiceContainer {
  if (!_container) _container = new ServiceContainer()
  return _container
}
