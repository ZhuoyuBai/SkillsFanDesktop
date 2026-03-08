/**
 * Preload Script - Exposes IPC to renderer
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { ThinkingEffort } from '../shared/utils/openai-models'

// Type definitions for exposed API
export interface SkillsFanAPI {
  // Generic Auth (provider-agnostic)
  authGetProviders: () => Promise<IpcResponse>
  authStartLogin: (providerType: string) => Promise<IpcResponse>
  authCompleteLogin: (providerType: string, state: string) => Promise<IpcResponse>
  authRefreshToken: (providerType: string) => Promise<IpcResponse>
  authCheckToken: (providerType: string) => Promise<IpcResponse>
  authLogout: (providerType: string) => Promise<IpcResponse>
  onAuthLoginProgress: (callback: (data: { provider: string; status: string }) => void) => () => void

  // Config
  getConfig: () => Promise<IpcResponse>
  setConfig: (updates: Record<string, unknown>) => Promise<IpcResponse>
  validateApi: (apiKey: string, apiUrl: string, provider: string) => Promise<IpcResponse>
  refreshAISourcesConfig: () => Promise<IpcResponse>
  getPublicModels: () => Promise<IpcResponse>
  resetToDefault: () => Promise<IpcResponse>

  // Memory
  clearMemory: (scope: 'space' | 'all', spaceId?: string) => Promise<IpcResponse>
  readMemoryMd: (spaceId: string) => Promise<IpcResponse>
  saveMemoryMd: (spaceId: string, content: string) => Promise<IpcResponse>
  getMemoryStats: (spaceId: string) => Promise<IpcResponse>

  // Space
  setActiveSpace: (spaceId: string) => Promise<IpcResponse>
  getHaloSpace: () => Promise<IpcResponse>
  listSpaces: () => Promise<IpcResponse>
  createSpace: (input: { name: string; icon: string; customPath?: string }) => Promise<IpcResponse>
  deleteSpace: (spaceId: string) => Promise<IpcResponse>
  getSpace: (spaceId: string) => Promise<IpcResponse>
  openSpaceFolder: (spaceId: string) => Promise<IpcResponse>
  updateSpace: (spaceId: string, updates: { name?: string; icon?: string }) => Promise<IpcResponse>
  getDefaultSpacePath: () => Promise<IpcResponse>
  selectFolder: () => Promise<IpcResponse>
  pathExists: (targetPath: string) => Promise<IpcResponse<boolean>>
  updateSpacePreferences: (spaceId: string, preferences: {
    layout?: {
      artifactRailExpanded?: boolean
      chatWidth?: number
    }
  }) => Promise<IpcResponse>
  getSpacePreferences: (spaceId: string) => Promise<IpcResponse>
  spaceListFiles: (spaceId: string, query?: string) => Promise<IpcResponse>

  // Conversation
  listConversations: (spaceId: string) => Promise<IpcResponse>
  createConversation: (spaceId: string, title?: string) => Promise<IpcResponse>
  getConversation: (spaceId: string, conversationId: string) => Promise<IpcResponse>
  updateConversation: (
    spaceId: string,
    conversationId: string,
    updates: Record<string, unknown>
  ) => Promise<IpcResponse>
  touchConversation: (spaceId: string, conversationId: string) => Promise<IpcResponse>
  deleteConversation: (spaceId: string, conversationId: string) => Promise<IpcResponse>
  clearAllConversations: (spaceId: string) => Promise<IpcResponse>
  addMessage: (
    spaceId: string,
    conversationId: string,
    message: { role: string; content: string }
  ) => Promise<IpcResponse>
  updateLastMessage: (
    spaceId: string,
    conversationId: string,
    updates: Record<string, unknown>
  ) => Promise<IpcResponse>

  // Agent
  sendMessage: (request: {
    spaceId: string
    conversationId: string
    message: string
    resumeSessionId?: string
    images?: Array<{
      id: string
      type: 'image'
      mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      data: string
      name?: string
      size?: number
    }>
    attachments?: Array<{
      id: string
      type: 'image' | 'pdf' | 'text'
      mediaType: string
      data?: string
      content?: string
      name?: string
      size?: number
      language?: string
    }>
    aiBrowserEnabled?: boolean  // Enable AI Browser tools
    thinkingEffort?: ThinkingEffort  // Thinking effort level
    canvasContext?: {  // Canvas context for AI awareness
      isOpen: boolean
      tabCount: number
      activeTab: {
        type: string
        title: string
        url?: string
        path?: string
      } | null
      tabs: Array<{
        type: string
        title: string
        url?: string
        path?: string
        isActive: boolean
      }>
    }
  }) => Promise<IpcResponse>
  stopGeneration: (conversationId?: string) => Promise<IpcResponse>
  injectMessage: (request: {
    spaceId: string
    conversationId: string
    message: string
    images?: Array<{
      id: string
      type: 'image'
      mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      data: string
      name?: string
      size?: number
    }>
    attachments?: Array<{
      id: string
      type: 'image' | 'pdf' | 'text'
      mediaType: string
      data?: string
      content?: string
      name?: string
      size?: number
      language?: string
    }>
  }) => Promise<IpcResponse>
  approveTool: (conversationId: string) => Promise<IpcResponse>
  rejectTool: (conversationId: string) => Promise<IpcResponse>
  getSessionState: (conversationId: string) => Promise<IpcResponse>
  ensureSessionWarm: (spaceId: string, conversationId: string) => Promise<IpcResponse>
  testMcpConnections: () => Promise<{ success: boolean; servers: unknown[]; error?: string }>
  answerUserQuestion: (conversationId: string, answers: Record<string, string>) => Promise<IpcResponse>
  rewindFiles: (conversationId: string, userMessageUuid: string) => Promise<IpcResponse>

  // Event listeners
  onAgentStart: (callback: (data: unknown) => void) => () => void
  onAgentMessage: (callback: (data: unknown) => void) => () => void
  onAgentToolCall: (callback: (data: unknown) => void) => () => void
  onAgentToolResult: (callback: (data: unknown) => void) => () => void
  onAgentToolApprovalResolved: (callback: (data: unknown) => void) => () => void
  onAgentError: (callback: (data: unknown) => void) => () => void
  onAgentComplete: (callback: (data: unknown) => void) => () => void
  onAgentThinking: (callback: (data: unknown) => void) => () => void
  onAgentThought: (callback: (data: unknown) => void) => () => void
  onAgentMcpStatus: (callback: (data: unknown) => void) => () => void
  onAgentCompact: (callback: (data: unknown) => void) => () => void
  onAgentUserQuestion: (callback: (data: unknown) => void) => () => void
  onAgentUserQuestionAnswered: (callback: (data: unknown) => void) => () => void

  // Artifact
  listArtifacts: (spaceId: string) => Promise<IpcResponse>
  listArtifactsTree: (spaceId: string) => Promise<IpcResponse>
  openArtifact: (filePath: string) => Promise<IpcResponse>
  showArtifactInFolder: (filePath: string) => Promise<IpcResponse>
  readArtifactContent: (filePath: string) => Promise<IpcResponse>
  watchArtifactFile: (filePath: string) => Promise<IpcResponse>
  unwatchArtifactFile: (filePath: string) => Promise<IpcResponse>
  onArtifactFileChanged: (callback: (data: { filePath: string }) => void) => () => void

  // Skill
  listSkills: () => Promise<IpcResponse>
  reloadSkills: () => Promise<IpcResponse>
  getSkillsDir: () => Promise<IpcResponse>
  selectSkillArchive: () => Promise<IpcResponse<string | undefined>>
  installSkill: (
    archivePath: string,
    conflictResolution?: 'replace' | 'rename' | 'cancel'
  ) => Promise<IpcResponse>
  deleteSkill: (skillName: string) => Promise<IpcResponse>
  openSkillFolder: (skillName: string) => Promise<IpcResponse>
  listSlashCommands: (spaceId?: string) => Promise<IpcResponse>
  getSkillContent: (skillName: string) => Promise<IpcResponse<string>>
  getSkillFileContent: (skillName: string, relativePath: string) => Promise<IpcResponse<string>>

  // Onboarding
  writeOnboardingArtifact: (spaceId: string, filename: string, content: string) => Promise<IpcResponse>
  saveOnboardingConversation: (spaceId: string, userPrompt: string, aiResponse: string) => Promise<IpcResponse>

  // Remote Access
  enableRemoteAccess: (port?: number) => Promise<IpcResponse>
  disableRemoteAccess: () => Promise<IpcResponse>
  enableTunnel: () => Promise<IpcResponse>
  disableTunnel: () => Promise<IpcResponse>
  getRemoteStatus: () => Promise<IpcResponse>
  getRemoteQRCode: (includeToken?: boolean) => Promise<IpcResponse>
  setRemotePassword: (password: string) => Promise<IpcResponse>
  regenerateRemotePassword: () => Promise<IpcResponse>
  onRemoteStatusChange: (callback: (data: unknown) => void) => () => void

  // Feishu Bot
  feishuStatus: () => Promise<IpcResponse>
  feishuTestConnection: (appId: string, appSecret: string) => Promise<IpcResponse>
  feishuSetCredentials: (appId: string, appSecret: string) => Promise<IpcResponse>
  feishuEnable: () => Promise<IpcResponse>
  feishuDisable: () => Promise<IpcResponse>
  feishuRegeneratePairingCode: () => Promise<IpcResponse>
  feishuRevokeChat: (chatId: string) => Promise<IpcResponse>
  feishuGetSessions: () => Promise<IpcResponse>
  feishuSetGroupPolicy: (policy: string) => Promise<IpcResponse>
  feishuSetDefaultSpace: (spaceId: string | null) => Promise<IpcResponse>

  // System Settings
  getAutoLaunch: () => Promise<IpcResponse>
  setAutoLaunch: (enabled: boolean) => Promise<IpcResponse>
  getMinimizeToTray: () => Promise<IpcResponse>
  setMinimizeToTray: (enabled: boolean) => Promise<IpcResponse>

  // Window
  setTitleBarOverlay: (options: { color: string; symbolColor: string }) => Promise<IpcResponse>
  setWindowButtonVisibility: (visible: boolean) => Promise<IpcResponse>
  maximizeWindow: () => Promise<IpcResponse>
  unmaximizeWindow: () => Promise<IpcResponse>
  isWindowMaximized: () => Promise<IpcResponse<boolean>>
  toggleMaximizeWindow: () => Promise<IpcResponse<boolean>>
  onWindowMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void

  // Search
  search: (
    query: string,
    scope: 'conversation' | 'space' | 'global',
    conversationId?: string,
    spaceId?: string
  ) => Promise<IpcResponse>
  cancelSearch: () => Promise<IpcResponse>
  onSearchProgress: (callback: (data: unknown) => void) => () => void
  onSearchCancelled: (callback: () => void) => () => void

  // Updater
  checkForUpdates: () => Promise<IpcResponse>
  downloadUpdate: () => Promise<IpcResponse>
  installUpdate: () => Promise<IpcResponse>
  getVersion: () => Promise<IpcResponse>
  getUpdateInfo: () => Promise<IpcResponse>
  openDownloadPage: () => Promise<IpcResponse>
  onUpdaterStatus: (callback: (data: unknown) => void) => () => void
  onDownloadProgress: (callback: (data: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  }) => void) => () => void

  // Browser (embedded browser for Content Canvas)
  createBrowserView: (viewId: string, url?: string) => Promise<IpcResponse>
  destroyBrowserView: (viewId: string) => Promise<IpcResponse>
  destroyAllBrowserViews: () => Promise<IpcResponse>
  showBrowserView: (viewId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<IpcResponse>
  hideBrowserView: (viewId: string) => Promise<IpcResponse>
  resizeBrowserView: (viewId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<IpcResponse>
  navigateBrowserView: (viewId: string, url: string) => Promise<IpcResponse>
  browserGoBack: (viewId: string) => Promise<IpcResponse>
  browserGoForward: (viewId: string) => Promise<IpcResponse>
  browserReload: (viewId: string) => Promise<IpcResponse>
  browserStop: (viewId: string) => Promise<IpcResponse>
  getBrowserState: (viewId: string) => Promise<IpcResponse>
  captureBrowserView: (viewId: string) => Promise<IpcResponse>
  executeBrowserJS: (viewId: string, code: string) => Promise<IpcResponse>
  setBrowserZoom: (viewId: string, level: number) => Promise<IpcResponse>
  toggleBrowserDevTools: (viewId: string) => Promise<IpcResponse>
  showBrowserContextMenu: (options: { viewId: string; url?: string; zoomLevel: number }) => Promise<IpcResponse>
  onBrowserStateChange: (callback: (data: unknown) => void) => () => void
  onBrowserZoomChanged: (callback: (data: { viewId: string; zoomLevel: number }) => void) => () => void

  // Canvas Tab Menu
  showCanvasTabContextMenu: (options: {
    tabId: string
    tabIndex: number
    tabTitle: string
    tabPath?: string
    tabCount: number
    hasTabsToRight: boolean
  }) => Promise<IpcResponse>
  onCanvasTabAction: (callback: (data: {
    action: 'close' | 'closeOthers' | 'closeToRight' | 'copyPath' | 'refresh'
    tabId?: string
    tabIndex?: number
    tabPath?: string
  }) => void) => () => void

  // AI Browser
  onAIBrowserActiveViewChanged: (callback: (data: { viewId: string; url: string | null; title: string | null }) => void) => () => void

  // Overlay (for floating UI above BrowserView)
  showChatCapsuleOverlay: () => Promise<IpcResponse>
  hideChatCapsuleOverlay: () => Promise<IpcResponse>
  onCanvasExitMaximized: (callback: () => void) => () => void

  // Performance Monitoring (Developer Tools)
  perfStart: (config?: { sampleInterval?: number; maxSamples?: number }) => Promise<IpcResponse>
  perfStop: () => Promise<IpcResponse>
  perfGetState: () => Promise<IpcResponse>
  perfGetHistory: () => Promise<IpcResponse>
  perfClearHistory: () => Promise<IpcResponse>
  perfSetConfig: (config: { enabled?: boolean; sampleInterval?: number; warnOnThreshold?: boolean }) => Promise<IpcResponse>
  perfExport: () => Promise<IpcResponse<string>>
  perfReportRendererMetrics: (metrics: {
    fps: number
    frameTime: number
    renderCount: number
    domNodes: number
    eventListeners: number
    jsHeapUsed: number
    jsHeapLimit: number
    longTasks: number
  }) => void
  onPerfSnapshot: (callback: (data: unknown) => void) => () => void
  onPerfWarning: (callback: (data: unknown) => void) => () => void

  // Git Bash (Windows only)
  getGitBashStatus: () => Promise<IpcResponse<{
    found: boolean
    path: string | null
    source: 'system' | 'app-local' | 'env-var' | null
  }>>
  installGitBash: (onProgress: (progress: {
    phase: 'downloading' | 'extracting' | 'configuring' | 'done' | 'error'
    progress: number
    message: string
    error?: string
  }) => void) => Promise<{ success: boolean; path?: string; error?: string }>
  openExternal: (url: string) => Promise<void>

  // Bootstrap lifecycle events
  onBootstrapExtendedReady: (callback: (data: { timestamp: number; duration: number }) => void) => () => void

  // Ralph (Loop Task)
  ralphCreateTask: (config: {
    projectDir: string
    description: string
    stories: Array<{
      id: string
      title: string
      description: string
      acceptanceCriteria: string[]
      priority: number
      status: string
      notes: string
    }>
    maxIterations: number
    branchName?: string
  }) => Promise<IpcResponse>
  ralphStart: (spaceId: string | null, taskId: string) => Promise<IpcResponse>
  ralphStop: (taskId: string) => Promise<IpcResponse>
  ralphGetTask: (taskId: string) => Promise<IpcResponse>
  ralphGetCurrent: () => Promise<IpcResponse>
  ralphGenerateStories: (config: { projectDir: string; description: string }) => Promise<IpcResponse>
  ralphImportPrd: (config: { projectDir: string }) => Promise<IpcResponse>
  ralphPrdExists: (projectDir: string) => Promise<IpcResponse>
  onRalphTaskUpdate: (callback: (data: { task: unknown }) => void) => () => void
  onRalphStoryLog: (callback: (data: { taskId: string; storyId: string; log: string }) => void) => () => void

  // Loop Task (persistent storage)
  loopTaskList: (spaceId: string) => Promise<IpcResponse>
  loopTaskListScheduled: () => Promise<IpcResponse>
  loopTaskCreate: (spaceId: string, config: {
    name?: string
    projectDir: string
    description: string
    source: 'import' | 'generate' | 'manual'
    stories: Array<{
      id: string
      title: string
      description: string
      acceptanceCriteria: string[]
      priority: number
      status: string
      notes: string
    }>
    maxIterations: number
    branchName?: string
  }) => Promise<IpcResponse>
  loopTaskGet: (spaceId: string, taskId: string) => Promise<IpcResponse>
  loopTaskUpdate: (spaceId: string, taskId: string, updates: Record<string, unknown>) => Promise<IpcResponse>
  loopTaskRename: (spaceId: string, taskId: string, name: string) => Promise<IpcResponse>
  loopTaskDelete: (spaceId: string, taskId: string) => Promise<IpcResponse>
  loopTaskAddStory: (spaceId: string, taskId: string, story: {
    title: string
    description: string
    acceptanceCriteria: string[]
    priority: number
    notes: string
  }) => Promise<IpcResponse>
  loopTaskUpdateStory: (spaceId: string, taskId: string, storyId: string, updates: Record<string, unknown>) => Promise<IpcResponse>
  loopTaskRemoveStory: (spaceId: string, taskId: string, storyId: string) => Promise<IpcResponse>
  loopTaskReorderStories: (spaceId: string, taskId: string, fromIndex: number, toIndex: number) => Promise<IpcResponse>
  loopTaskRetryStory: (spaceId: string, taskId: string, storyId: string) => Promise<IpcResponse>
  loopTaskRetryFailed: (spaceId: string, taskId: string) => Promise<IpcResponse>
  loopTaskResetAll: (spaceId: string, taskId: string) => Promise<IpcResponse>
  loopTaskExportPrd: (config: {
    projectDir: string
    description: string
    stories: Array<{
      id: string
      title: string
      description: string
      acceptanceCriteria: string[]
      priority: number
      notes?: string
    }>
    branchName?: string
  }) => Promise<IpcResponse>
  loopTaskDeletePrd: (prdPath: string) => Promise<IpcResponse>
  readFile: (filePath: string) => Promise<IpcResponse>

  // SkillsFan Account Auth
  skillsfanStartLogin: () => Promise<IpcResponse>
  skillsfanLogout: () => Promise<IpcResponse>
  skillsfanGetUser: () => Promise<IpcResponse>
  skillsfanGetAuthState: () => Promise<IpcResponse>
  skillsfanIsLoggedIn: () => Promise<IpcResponse>
  skillsfanRefreshToken: () => Promise<IpcResponse>
  skillsfanEnsureValidToken: () => Promise<IpcResponse>
  skillsfanGetAccessToken: () => Promise<IpcResponse>
  skillsfanGetCredits: () => Promise<IpcResponse>
  skillsfanRefreshCredits: () => Promise<IpcResponse>
  onSkillsFanLoginSuccess: (callback: (data: { user: unknown }) => void) => () => void
  onSkillsFanLoginError: (callback: (data: { error: string }) => void) => () => void
  onSkillsFanLogout: (callback: () => void) => () => void
}

interface IpcResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

const PRELOAD_DEBUG = import.meta.env.DEV && import.meta.env.VITE_DEBUG_LOGS !== 'false'

function preloadDebug(...args: unknown[]): void {
  if (!PRELOAD_DEBUG) {
    return
  }
  console.log(...args)
}

// Create event listener with cleanup
function createEventListener(channel: string, callback: (data: unknown) => void): () => void {
  preloadDebug(`[Preload] Creating event listener for channel: ${channel}`)

  const handler = (_event: Electron.IpcRendererEvent, data: unknown): void => {
    preloadDebug(`[Preload] Received event on channel: ${channel}`, data)
    callback(data)
  }

  ipcRenderer.on(channel, handler)

  return () => {
    preloadDebug(`[Preload] Removing event listener for channel: ${channel}`)
    ipcRenderer.removeListener(channel, handler)
  }
}

// Expose API to renderer
const api: SkillsFanAPI = {
  // Generic Auth (provider-agnostic)
  authGetProviders: () => ipcRenderer.invoke('auth:get-providers'),
  authStartLogin: (providerType) => ipcRenderer.invoke('auth:start-login', providerType),
  authCompleteLogin: (providerType, state) => ipcRenderer.invoke('auth:complete-login', providerType, state),
  authRefreshToken: (providerType) => ipcRenderer.invoke('auth:refresh-token', providerType),
  authCheckToken: (providerType) => ipcRenderer.invoke('auth:check-token', providerType),
  authLogout: (providerType) => ipcRenderer.invoke('auth:logout', providerType),
  onAuthLoginProgress: (callback) => createEventListener('auth:login-progress', callback as (data: unknown) => void),

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (updates) => ipcRenderer.invoke('config:set', updates),
  validateApi: (apiKey, apiUrl, provider) =>
    ipcRenderer.invoke('config:validate-api', apiKey, apiUrl, provider),
  refreshAISourcesConfig: () => ipcRenderer.invoke('config:refresh-ai-sources'),
  getPublicModels: () => ipcRenderer.invoke('config:get-public-models'),
  resetToDefault: () => ipcRenderer.invoke('config:reset-to-default'),

  // Memory
  clearMemory: (scope: 'space' | 'all', spaceId?: string) =>
    ipcRenderer.invoke('memory:clear', scope, spaceId),
  readMemoryMd: (spaceId: string) =>
    ipcRenderer.invoke('memory:read-md', spaceId),
  saveMemoryMd: (spaceId: string, content: string) =>
    ipcRenderer.invoke('memory:save-md', spaceId, content),
  getMemoryStats: (spaceId: string) =>
    ipcRenderer.invoke('memory:get-stats', spaceId),

  // Space
  setActiveSpace: (spaceId) => ipcRenderer.invoke('space:set-active', spaceId),
  getHaloSpace: () => ipcRenderer.invoke('space:get-halo'),
  listSpaces: () => ipcRenderer.invoke('space:list'),
  createSpace: (input) => ipcRenderer.invoke('space:create', input),
  deleteSpace: (spaceId) => ipcRenderer.invoke('space:delete', spaceId),
  getSpace: (spaceId) => ipcRenderer.invoke('space:get', spaceId),
  openSpaceFolder: (spaceId) => ipcRenderer.invoke('space:open-folder', spaceId),
  updateSpace: (spaceId, updates) => ipcRenderer.invoke('space:update', spaceId, updates),
  getDefaultSpacePath: () => ipcRenderer.invoke('space:get-default-path'),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  pathExists: (targetPath) => ipcRenderer.invoke('space:path-exists', targetPath),
  updateSpacePreferences: (spaceId, preferences) =>
    ipcRenderer.invoke('space:update-preferences', spaceId, preferences),
  getSpacePreferences: (spaceId) => ipcRenderer.invoke('space:get-preferences', spaceId),
  spaceListFiles: (spaceId, query) => ipcRenderer.invoke('space:list-files', spaceId, query),

  // Conversation
  listConversations: (spaceId) => ipcRenderer.invoke('conversation:list', spaceId),
  createConversation: (spaceId, title) => ipcRenderer.invoke('conversation:create', spaceId, title),
  getConversation: (spaceId, conversationId) =>
    ipcRenderer.invoke('conversation:get', spaceId, conversationId),
  updateConversation: (spaceId, conversationId, updates) =>
    ipcRenderer.invoke('conversation:update', spaceId, conversationId, updates),
  touchConversation: (spaceId, conversationId) =>
    ipcRenderer.invoke('conversation:touch', spaceId, conversationId),
  deleteConversation: (spaceId, conversationId) =>
    ipcRenderer.invoke('conversation:delete', spaceId, conversationId),
  clearAllConversations: (spaceId) =>
    ipcRenderer.invoke('conversation:clear-all', spaceId),
  addMessage: (spaceId, conversationId, message) =>
    ipcRenderer.invoke('conversation:add-message', spaceId, conversationId, message),
  updateLastMessage: (spaceId, conversationId, updates) =>
    ipcRenderer.invoke('conversation:update-last-message', spaceId, conversationId, updates),

  // Agent
  sendMessage: (request) => ipcRenderer.invoke('agent:send-message', request),
  stopGeneration: (conversationId) => ipcRenderer.invoke('agent:stop', conversationId),
  injectMessage: (request) => ipcRenderer.invoke('agent:inject-message', request),
  approveTool: (conversationId) => ipcRenderer.invoke('agent:approve-tool', conversationId),
  rejectTool: (conversationId) => ipcRenderer.invoke('agent:reject-tool', conversationId),
  getSessionState: (conversationId) => ipcRenderer.invoke('agent:get-session-state', conversationId),
  ensureSessionWarm: (spaceId, conversationId) => ipcRenderer.invoke('agent:ensure-session-warm', spaceId, conversationId),
  testMcpConnections: () => ipcRenderer.invoke('agent:test-mcp'),
  answerUserQuestion: (conversationId, answers) => ipcRenderer.invoke('agent:answer-question', conversationId, answers),
  rewindFiles: (conversationId, userMessageUuid) => ipcRenderer.invoke('agent:rewind-files', conversationId, userMessageUuid),

  // Event listeners
  onAgentStart: (callback) => createEventListener('agent:start', callback),
  onAgentMessage: (callback) => createEventListener('agent:message', callback),
  onAgentToolCall: (callback) => createEventListener('agent:tool-call', callback),
  onAgentToolResult: (callback) => createEventListener('agent:tool-result', callback),
  onAgentToolApprovalResolved: (callback) => createEventListener('agent:tool-approval-resolved', callback),
  onAgentError: (callback) => createEventListener('agent:error', callback),
  onAgentComplete: (callback) => createEventListener('agent:complete', callback),
  onAgentThinking: (callback) => createEventListener('agent:thinking', callback),
  onAgentThought: (callback) => createEventListener('agent:thought', callback),
  onAgentMcpStatus: (callback) => createEventListener('agent:mcp-status', callback),
  onAgentCompact: (callback) => createEventListener('agent:compact', callback),
  onAgentUserQuestion: (callback) => createEventListener('agent:user-question', callback),
  onAgentUserQuestionAnswered: (callback) => createEventListener('agent:user-question-answered', callback),

  // Artifact
  listArtifacts: (spaceId) => ipcRenderer.invoke('artifact:list', spaceId),
  listArtifactsTree: (spaceId) => ipcRenderer.invoke('artifact:list-tree', spaceId),
  openArtifact: (filePath) => ipcRenderer.invoke('artifact:open', filePath),
  showArtifactInFolder: (filePath) => ipcRenderer.invoke('artifact:show-in-folder', filePath),
  readArtifactContent: (filePath) => ipcRenderer.invoke('artifact:read-content', filePath),
  watchArtifactFile: (filePath) => ipcRenderer.invoke('artifact:watch-file', filePath),
  unwatchArtifactFile: (filePath) => ipcRenderer.invoke('artifact:unwatch-file', filePath),
  onArtifactFileChanged: (callback) => createEventListener('artifact:file-changed', callback as (data: unknown) => void),

  // Skill
  listSkills: () => ipcRenderer.invoke('skill:list'),
  reloadSkills: () => ipcRenderer.invoke('skill:reload'),
  getSkillsDir: () => ipcRenderer.invoke('skill:get-dir'),
  selectSkillArchive: () => ipcRenderer.invoke('skill:select-archive'),
  installSkill: (archivePath, conflictResolution) =>
    ipcRenderer.invoke('skill:install', archivePath, conflictResolution),
  deleteSkill: (skillName) => ipcRenderer.invoke('skill:delete', skillName),
  openSkillFolder: (skillName) => ipcRenderer.invoke('skill:open-folder', skillName),
  listSlashCommands: (spaceId) => ipcRenderer.invoke('skill:list-slash-commands', spaceId),
  getSkillContent: (skillName) => ipcRenderer.invoke('skill:get-content', skillName),
  getSkillFileContent: (skillName, relativePath) =>
    ipcRenderer.invoke('skill:get-file-content', skillName, relativePath),

  // Onboarding
  writeOnboardingArtifact: (spaceId, filename, content) =>
    ipcRenderer.invoke('onboarding:write-artifact', spaceId, filename, content),
  saveOnboardingConversation: (spaceId, userPrompt, aiResponse) =>
    ipcRenderer.invoke('onboarding:save-conversation', spaceId, userPrompt, aiResponse),

  // Remote Access
  enableRemoteAccess: (port) => ipcRenderer.invoke('remote:enable', port),
  disableRemoteAccess: () => ipcRenderer.invoke('remote:disable'),
  enableTunnel: () => ipcRenderer.invoke('remote:tunnel:enable'),
  disableTunnel: () => ipcRenderer.invoke('remote:tunnel:disable'),
  getRemoteStatus: () => ipcRenderer.invoke('remote:status'),
  getRemoteQRCode: (includeToken) => ipcRenderer.invoke('remote:qrcode', includeToken),
  setRemotePassword: (password) => ipcRenderer.invoke('remote:set-password', password),
  regenerateRemotePassword: () => ipcRenderer.invoke('remote:regenerate-password'),
  onRemoteStatusChange: (callback) => createEventListener('remote:status-change', callback),

  // Feishu Bot
  feishuStatus: () => ipcRenderer.invoke('feishu:status'),
  feishuTestConnection: (appId, appSecret) => ipcRenderer.invoke('feishu:test-connection', appId, appSecret),
  feishuSetCredentials: (appId, appSecret) => ipcRenderer.invoke('feishu:set-credentials', appId, appSecret),
  feishuEnable: () => ipcRenderer.invoke('feishu:enable'),
  feishuDisable: () => ipcRenderer.invoke('feishu:disable'),
  feishuRegeneratePairingCode: () => ipcRenderer.invoke('feishu:regenerate-pairing-code'),
  feishuRevokeChat: (chatId) => ipcRenderer.invoke('feishu:revoke-chat', chatId),
  feishuGetSessions: () => ipcRenderer.invoke('feishu:get-sessions'),
  feishuSetGroupPolicy: (policy) => ipcRenderer.invoke('feishu:set-group-policy', policy),
  feishuSetDefaultSpace: (spaceId) => ipcRenderer.invoke('feishu:set-default-space', spaceId),

  // System Settings
  getAutoLaunch: () => ipcRenderer.invoke('system:get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('system:set-auto-launch', enabled),
  getMinimizeToTray: () => ipcRenderer.invoke('system:get-minimize-to-tray'),
  setMinimizeToTray: (enabled) => ipcRenderer.invoke('system:set-minimize-to-tray', enabled),

  // Window
  setTitleBarOverlay: (options) => ipcRenderer.invoke('window:set-title-bar-overlay', options),
  setWindowButtonVisibility: (visible) => ipcRenderer.invoke('window:set-button-visibility', visible),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  unmaximizeWindow: () => ipcRenderer.invoke('window:unmaximize'),
  isWindowMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  onWindowMaximizeChange: (callback) => createEventListener('window:maximize-change', callback as (data: unknown) => void),

  // Search
  search: (query, scope, conversationId, spaceId) =>
    ipcRenderer.invoke('search:execute', query, scope, conversationId, spaceId),
  cancelSearch: () => ipcRenderer.invoke('search:cancel'),
  onSearchProgress: (callback) => createEventListener('search:progress', callback),
  onSearchCancelled: (callback) => createEventListener('search:cancelled', callback),

  // Updater
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  getVersion: () => ipcRenderer.invoke('updater:get-version'),
  getUpdateInfo: () => ipcRenderer.invoke('updater:get-info'),
  openDownloadPage: () => ipcRenderer.invoke('updater:open-download'),
  onUpdaterStatus: (callback) => createEventListener('updater:status', callback),
  onDownloadProgress: (callback) => createEventListener('updater:download-progress', callback as (data: unknown) => void),

  // Browser (embedded browser for Content Canvas)
  createBrowserView: (viewId, url) => ipcRenderer.invoke('browser:create', { viewId, url }),
  destroyBrowserView: (viewId) => ipcRenderer.invoke('browser:destroy', { viewId }),
  destroyAllBrowserViews: () => ipcRenderer.invoke('browser:destroy-all'),
  showBrowserView: (viewId, bounds) => ipcRenderer.invoke('browser:show', { viewId, bounds }),
  hideBrowserView: (viewId) => ipcRenderer.invoke('browser:hide', { viewId }),
  resizeBrowserView: (viewId, bounds) => ipcRenderer.invoke('browser:resize', { viewId, bounds }),
  navigateBrowserView: (viewId, url) => ipcRenderer.invoke('browser:navigate', { viewId, url }),
  browserGoBack: (viewId) => ipcRenderer.invoke('browser:go-back', { viewId }),
  browserGoForward: (viewId) => ipcRenderer.invoke('browser:go-forward', { viewId }),
  browserReload: (viewId) => ipcRenderer.invoke('browser:reload', { viewId }),
  browserStop: (viewId) => ipcRenderer.invoke('browser:stop', { viewId }),
  getBrowserState: (viewId) => ipcRenderer.invoke('browser:get-state', { viewId }),
  captureBrowserView: (viewId) => ipcRenderer.invoke('browser:capture', { viewId }),
  executeBrowserJS: (viewId, code) => ipcRenderer.invoke('browser:execute-js', { viewId, code }),
  setBrowserZoom: (viewId, level) => ipcRenderer.invoke('browser:zoom', { viewId, level }),
  toggleBrowserDevTools: (viewId) => ipcRenderer.invoke('browser:dev-tools', { viewId }),
  showBrowserContextMenu: (options) => ipcRenderer.invoke('browser:show-context-menu', options),
  onBrowserStateChange: (callback) => createEventListener('browser:state-change', callback),
  onBrowserZoomChanged: (callback) => createEventListener('browser:zoom-changed', callback as (data: unknown) => void),

  // Canvas Tab Menu (native Electron menu)
  showCanvasTabContextMenu: (options) => ipcRenderer.invoke('canvas:show-tab-context-menu', options),
  onCanvasTabAction: (callback) => createEventListener('canvas:tab-action', callback as (data: unknown) => void),

  // AI Browser - active view change notification from main process
  onAIBrowserActiveViewChanged: (callback) => createEventListener('ai-browser:active-view-changed', callback as (data: unknown) => void),

  // Overlay (for floating UI above BrowserView)
  showChatCapsuleOverlay: () => ipcRenderer.invoke('overlay:show-chat-capsule'),
  hideChatCapsuleOverlay: () => ipcRenderer.invoke('overlay:hide-chat-capsule'),
  onCanvasExitMaximized: (callback) => createEventListener('canvas:exit-maximized', callback as (data: unknown) => void),

  // Performance Monitoring (Developer Tools)
  perfStart: (config) => ipcRenderer.invoke('perf:start', config),
  perfStop: () => ipcRenderer.invoke('perf:stop'),
  perfGetState: () => ipcRenderer.invoke('perf:get-state'),
  perfGetHistory: () => ipcRenderer.invoke('perf:get-history'),
  perfClearHistory: () => ipcRenderer.invoke('perf:clear-history'),
  perfSetConfig: (config) => ipcRenderer.invoke('perf:set-config', config),
  perfExport: () => ipcRenderer.invoke('perf:export'),
  perfReportRendererMetrics: (metrics) => ipcRenderer.send('perf:renderer-metrics', metrics),
  onPerfSnapshot: (callback) => createEventListener('perf:snapshot', callback),
  onPerfWarning: (callback) => createEventListener('perf:warning', callback),

  // Git Bash (Windows only)
  getGitBashStatus: () => ipcRenderer.invoke('git-bash:status'),
  installGitBash: async (onProgress) => {
    // Create a unique channel for this installation
    const progressChannel = `git-bash:install-progress-${Date.now()}`

    // Set up progress listener
    const progressHandler = (_event: Electron.IpcRendererEvent, progress: unknown) => {
      onProgress(progress as Parameters<typeof onProgress>[0])
    }
    ipcRenderer.on(progressChannel, progressHandler)

    try {
      const result = await ipcRenderer.invoke('git-bash:install', { progressChannel })
      return result as { success: boolean; path?: string; error?: string }
    } finally {
      ipcRenderer.removeListener(progressChannel, progressHandler)
    }
  },
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // Bootstrap lifecycle events
  onBootstrapExtendedReady: (callback) => createEventListener('bootstrap:extended-ready', callback as (data: unknown) => void),

  // Ralph (Loop Task)
  ralphCreateTask: (config) => ipcRenderer.invoke('ralph:create-task', config),
  ralphStart: (spaceId, taskId) => ipcRenderer.invoke('ralph:start', spaceId, taskId),
  ralphStop: (taskId) => ipcRenderer.invoke('ralph:stop', taskId),
  ralphGetTask: (taskId) => ipcRenderer.invoke('ralph:get-task', taskId),
  ralphGetCurrent: () => ipcRenderer.invoke('ralph:get-current'),
  ralphGenerateStories: (config) => ipcRenderer.invoke('ralph:generate-stories', config),
  ralphImportPrd: (config) => ipcRenderer.invoke('ralph:import-prd', config),
  ralphPrdExists: (projectDir) => ipcRenderer.invoke('ralph:prd-exists', projectDir),
  onRalphTaskUpdate: (callback) => createEventListener('ralph:task-update', callback as (data: unknown) => void),
  onRalphStoryLog: (callback) => createEventListener('ralph:story-log', callback as (data: unknown) => void),

  // Loop Task (persistent storage)
  loopTaskList: (spaceId) => ipcRenderer.invoke('loop-task:list', spaceId),
  loopTaskListScheduled: () => ipcRenderer.invoke('loop-task:list-scheduled'),
  loopTaskCreate: (spaceId, config) => ipcRenderer.invoke('loop-task:create', spaceId, config),
  loopTaskGet: (spaceId, taskId) => ipcRenderer.invoke('loop-task:get', spaceId, taskId),
  loopTaskUpdate: (spaceId, taskId, updates) => ipcRenderer.invoke('loop-task:update', spaceId, taskId, updates),
  loopTaskRename: (spaceId, taskId, name) => ipcRenderer.invoke('loop-task:rename', spaceId, taskId, name),
  loopTaskDelete: (spaceId, taskId) => ipcRenderer.invoke('loop-task:delete', spaceId, taskId),
  loopTaskAddStory: (spaceId, taskId, story) => ipcRenderer.invoke('loop-task:add-story', spaceId, taskId, story),
  loopTaskUpdateStory: (spaceId, taskId, storyId, updates) => ipcRenderer.invoke('loop-task:update-story', spaceId, taskId, storyId, updates),
  loopTaskRemoveStory: (spaceId, taskId, storyId) => ipcRenderer.invoke('loop-task:remove-story', spaceId, taskId, storyId),
  loopTaskReorderStories: (spaceId, taskId, fromIndex, toIndex) => ipcRenderer.invoke('loop-task:reorder-stories', spaceId, taskId, fromIndex, toIndex),
  loopTaskRetryStory: (spaceId, taskId, storyId) => ipcRenderer.invoke('loop-task:retry-story', spaceId, taskId, storyId),
  loopTaskRetryFailed: (spaceId, taskId) => ipcRenderer.invoke('loop-task:retry-failed', spaceId, taskId),
  loopTaskResetAll: (spaceId, taskId) => ipcRenderer.invoke('loop-task:reset-all', spaceId, taskId),
  loopTaskExportPrd: (config) => ipcRenderer.invoke('loop-task:export-prd', config),
  loopTaskDeletePrd: (prdPath) => ipcRenderer.invoke('loop-task:delete-prd', prdPath),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),

  // SkillsFan Account Auth
  skillsfanStartLogin: () => ipcRenderer.invoke('skillsfan:start-login'),
  skillsfanLogout: () => ipcRenderer.invoke('skillsfan:logout'),
  skillsfanGetUser: () => ipcRenderer.invoke('skillsfan:get-user'),
  skillsfanGetAuthState: () => ipcRenderer.invoke('skillsfan:get-auth-state'),
  skillsfanIsLoggedIn: () => ipcRenderer.invoke('skillsfan:is-logged-in'),
  skillsfanRefreshToken: () => ipcRenderer.invoke('skillsfan:refresh-token'),
  skillsfanEnsureValidToken: () => ipcRenderer.invoke('skillsfan:ensure-valid-token'),
  skillsfanGetAccessToken: () => ipcRenderer.invoke('skillsfan:get-access-token'),
  skillsfanGetCredits: () => ipcRenderer.invoke('skillsfan:get-credits'),
  skillsfanRefreshCredits: () => ipcRenderer.invoke('skillsfan:refresh-credits'),
  onSkillsFanLoginSuccess: (callback) => createEventListener('skillsfan:login-success', callback as (data: unknown) => void),
  onSkillsFanLoginError: (callback) => createEventListener('skillsfan:login-error', callback as (data: unknown) => void),
  onSkillsFanLogout: (callback) => createEventListener('skillsfan:logout', callback as (data: unknown) => void),
}

contextBridge.exposeInMainWorld('skillsfan', api)

// Analytics: Listen for tracking events from main process
// Baidu Tongji SDK is loaded in index.html, we just need to call _hmt.push()
// Note: _hmt is initialized as an array in index.html before SDK loads
// The SDK will process queued commands when it loads
ipcRenderer.on('analytics:track', (_event, data: {
  type: string
  category: string
  action: string
  label?: string
  value?: number
  customVars?: Record<string, unknown>
}) => {
  try {
    // _hmt is defined in index.html as: var _hmt = _hmt || []
    // We can push commands to it before SDK fully loads - SDK will process them
    const win = window as unknown as { _hmt?: unknown[][] }

    // Ensure _hmt exists
    if (!win._hmt) {
      win._hmt = []
    }

    if (data.type === 'trackEvent') {
      // _hmt.push(['_trackEvent', category, action, opt_label, opt_value])
      win._hmt.push(['_trackEvent', data.category, data.action, data.label || '', data.value || 0])
      preloadDebug('[Analytics] Baidu event queued:', data.action)
    }
  } catch (error) {
    console.warn('[Analytics] Failed to track Baidu event:', error)
  }
})

// Expose platform info for cross-platform UI adjustments
const platformInfo = {
  platform: process.platform as 'darwin' | 'win32' | 'linux',
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux'
}

contextBridge.exposeInMainWorld('platform', platformInfo)

// Expose basic electron IPC for overlay SPA
// This is used by the overlay window which doesn't need the full SkillsFan API
const electronAPI = {
  ipcRenderer: {
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    },
    removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
      ipcRenderer.removeListener(channel, callback as (...args: unknown[]) => void)
    },
    send: (channel: string, ...args: unknown[]) => {
      ipcRenderer.send(channel, ...args)
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)

// TypeScript declaration for window.skillsfan and window.platform
declare global {
  interface Window {
    skillsfan: SkillsFanAPI
    platform: {
      platform: 'darwin' | 'win32' | 'linux'
      isMac: boolean
      isWindows: boolean
      isLinux: boolean
    }
    // For overlay SPA - access via contextBridge
    electron?: {
      ipcRenderer: {
        on: (channel: string, callback: (...args: unknown[]) => void) => void
        removeListener: (channel: string, callback: (...args: unknown[]) => void) => void
        send: (channel: string, ...args: unknown[]) => void
      }
    }
  }
}
