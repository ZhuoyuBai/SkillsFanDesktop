/**
 * Halo API - Unified interface for both IPC and HTTP modes
 * Automatically selects the appropriate transport
 */

import {
  isElectron,
  httpRequest,
  onEvent,
  connectWebSocket,
  disconnectWebSocket,
  subscribeToConversation,
  unsubscribeFromConversation,
  setAuthToken,
  clearAuthToken,
  getAuthToken
} from './transport'
import type { ImageAttachment } from '../types'

// Response type
interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * API object - drop-in replacement for window.skillsfan
 * Works in both Electron and remote web mode
 */
export const api = {
  // ===== Authentication (remote only) =====
  isRemoteMode: () => !isElectron(),
  isAuthenticated: () => !!getAuthToken(),

  login: async (token: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return { success: true }
    }

    const result = await httpRequest<void>('POST', '/api/remote/login', { token })
    if (result.success) {
      setAuthToken(token)
      connectWebSocket()
    }
    return result
  },

  logout: () => {
    clearAuthToken()
    disconnectWebSocket()
  },

  // ===== Generic Auth (provider-agnostic) =====
  authGetProviders: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.authGetProviders()
    }
    return httpRequest('GET', '/api/auth/providers')
  },

  authStartLogin: async (providerType: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.authStartLogin(providerType)
    }
    return httpRequest('POST', '/api/auth/start-login', { providerType })
  },

  authCompleteLogin: async (providerType: string, state: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.authCompleteLogin(providerType, state)
    }
    return httpRequest('POST', '/api/auth/complete-login', { providerType, state })
  },

  authRefreshToken: async (providerType: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.authRefreshToken(providerType)
    }
    return httpRequest('POST', '/api/auth/refresh-token', { providerType })
  },

  authCheckToken: async (providerType: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.authCheckToken(providerType)
    }
    return httpRequest('GET', `/api/auth/check-token?providerType=${providerType}`)
  },

  authLogout: async (providerType: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.authLogout(providerType)
    }
    return httpRequest('POST', '/api/auth/logout', { providerType })
  },

  onAuthLoginProgress: (callback: (data: { provider: string; status: string }) => void) =>
    onEvent('auth:login-progress', callback),

  // ===== Config =====
  getConfig: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getConfig()
    }
    return httpRequest('GET', '/api/config')
  },

  setConfig: async (updates: Record<string, unknown>): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.setConfig(updates)
    }
    return httpRequest('POST', '/api/config', updates)
  },

  validateApi: async (
    apiKey: string,
    apiUrl: string,
    provider: string
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.validateApi(apiKey, apiUrl, provider)
    }
    return httpRequest('POST', '/api/config/validate', { apiKey, apiUrl, provider })
  },

  refreshAISourcesConfig: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.refreshAISourcesConfig()
    }
    return httpRequest('POST', '/api/config/refresh-ai-sources')
  },

  resetToDefault: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.resetToDefault()
    }
    // Remote mode does not support reset
    return { success: false, error: 'Reset to default is only available in desktop mode' }
  },

  // ===== Space =====
  getHaloSpace: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getHaloSpace()
    }
    return httpRequest('GET', '/api/spaces/halo')
  },

  listSpaces: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.listSpaces()
    }
    return httpRequest('GET', '/api/spaces')
  },

  createSpace: async (input: {
    name: string
    icon: string
    iconColor?: string
    customPath?: string
  }): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.createSpace(input)
    }
    return httpRequest('POST', '/api/spaces', input)
  },

  deleteSpace: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.deleteSpace(spaceId)
    }
    return httpRequest('DELETE', `/api/spaces/${spaceId}`)
  },

  getSpace: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getSpace(spaceId)
    }
    return httpRequest('GET', `/api/spaces/${spaceId}`)
  },

  openSpaceFolder: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.openSpaceFolder(spaceId)
    }
    // In remote mode, just return the path (can't open folder remotely)
    return httpRequest('POST', `/api/spaces/${spaceId}/open`)
  },

  getDefaultSpacePath: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getDefaultSpacePath()
    }
    // In remote mode, get default path from server
    return httpRequest('GET', '/api/spaces/default-path')
  },

  selectFolder: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.selectFolder()
    }
    // Cannot select folder in remote mode
    return { success: false, error: 'Cannot select folder in remote mode' }
  },

  updateSpace: async (
    spaceId: string,
    updates: { name?: string; icon?: string; iconColor?: string }
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.updateSpace(spaceId, updates)
    }
    return httpRequest('PUT', `/api/spaces/${spaceId}`, updates)
  },

  // Update space preferences (layout settings)
  updateSpacePreferences: async (
    spaceId: string,
    preferences: {
      layout?: {
        artifactRailExpanded?: boolean
        chatWidth?: number
      }
    }
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.updateSpacePreferences(spaceId, preferences)
    }
    return httpRequest('PUT', `/api/spaces/${spaceId}/preferences`, preferences)
  },

  // Get space preferences
  getSpacePreferences: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getSpacePreferences(spaceId)
    }
    return httpRequest('GET', `/api/spaces/${spaceId}/preferences`)
  },

  // ===== Conversation =====
  listConversations: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.listConversations(spaceId)
    }
    return httpRequest('GET', `/api/spaces/${spaceId}/conversations`)
  },

  createConversation: async (spaceId: string, title?: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.createConversation(spaceId, title)
    }
    return httpRequest('POST', `/api/spaces/${spaceId}/conversations`, { title })
  },

  getConversation: async (
    spaceId: string,
    conversationId: string
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getConversation(spaceId, conversationId)
    }
    return httpRequest('GET', `/api/spaces/${spaceId}/conversations/${conversationId}`)
  },

  updateConversation: async (
    spaceId: string,
    conversationId: string,
    updates: Record<string, unknown>
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.updateConversation(spaceId, conversationId, updates)
    }
    return httpRequest(
      'PUT',
      `/api/spaces/${spaceId}/conversations/${conversationId}`,
      updates
    )
  },

  touchConversation: async (
    spaceId: string,
    conversationId: string
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.touchConversation(spaceId, conversationId)
    }
    return httpRequest(
      'PUT',
      `/api/spaces/${spaceId}/conversations/${conversationId}/touch`
    )
  },

  deleteConversation: async (
    spaceId: string,
    conversationId: string
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.deleteConversation(spaceId, conversationId)
    }
    return httpRequest(
      'DELETE',
      `/api/spaces/${spaceId}/conversations/${conversationId}`
    )
  },

  clearAllConversations: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.clearAllConversations(spaceId)
    }
    return httpRequest('DELETE', `/api/spaces/${spaceId}/conversations`)
  },

  addMessage: async (
    spaceId: string,
    conversationId: string,
    message: { role: string; content: string }
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.addMessage(spaceId, conversationId, message)
    }
    return httpRequest(
      'POST',
      `/api/spaces/${spaceId}/conversations/${conversationId}/messages`,
      message
    )
  },

  updateLastMessage: async (
    spaceId: string,
    conversationId: string,
    updates: Record<string, unknown>
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.updateLastMessage(spaceId, conversationId, updates)
    }
    return httpRequest(
      'PUT',
      `/api/spaces/${spaceId}/conversations/${conversationId}/messages/last`,
      updates
    )
  },

  // ===== Agent =====
  sendMessage: async (request: {
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
    aiBrowserEnabled?: boolean  // Enable AI Browser tools
    thinkingEnabled?: boolean  // Enable extended thinking mode
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
  }): Promise<ApiResponse> => {
    // Subscribe to conversation events before sending
    if (!isElectron()) {
      subscribeToConversation(request.conversationId)
    }

    if (isElectron()) {
      return window.skillsfan.sendMessage(request)
    }
    return httpRequest('POST', '/api/agent/message', request)
  },

  stopGeneration: async (conversationId?: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.stopGeneration(conversationId)
    }
    return httpRequest('POST', '/api/agent/stop', { conversationId })
  },

  injectMessage: async (request: {
    spaceId: string
    conversationId: string
    message: string
    images?: ImageAttachment[]
  }): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.injectMessage(request)
    }
    return httpRequest('POST', '/api/agent/inject', request)
  },

  approveTool: async (conversationId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.approveTool(conversationId)
    }
    return httpRequest('POST', '/api/agent/approve', { conversationId })
  },

  rejectTool: async (conversationId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.rejectTool(conversationId)
    }
    return httpRequest('POST', '/api/agent/reject', { conversationId })
  },

  // Get current session state for recovery after refresh
  getSessionState: async (conversationId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getSessionState(conversationId)
    }
    return httpRequest('GET', `/api/agent/session/${conversationId}`)
  },

  // Warm up V2 session - call when switching conversations to prepare for faster message sending
  ensureSessionWarm: async (spaceId: string, conversationId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      // No need to wait, initialize in background
      window.skillsfan.ensureSessionWarm(spaceId, conversationId).catch((error: unknown) => {
        console.error('[API] ensureSessionWarm error:', error)
      })
      return { success: true }
    }
    // HTTP mode: send warm-up request to backend
    return httpRequest('POST', '/api/agent/warm', { spaceId, conversationId }).catch(() => ({
      success: false // Warm-up failure should not block
    }))
  },

  // Test MCP server connections
  testMcpConnections: async (): Promise<{ success: boolean; servers: unknown[]; error?: string }> => {
    if (isElectron()) {
      return window.skillsfan.testMcpConnections()
    }
    // HTTP mode: call backend endpoint
    const result = await httpRequest('POST', '/api/agent/test-mcp')
    return result as { success: boolean; servers: unknown[]; error?: string }
  },

  // Answer user question (AskUserQuestion tool)
  answerUserQuestion: async (conversationId: string, answers: Record<string, string>): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.answerUserQuestion(conversationId, answers)
    }
    return httpRequest('POST', '/api/agent/answer-question', { conversationId, answers })
  },

  // ===== Artifact =====
  listArtifacts: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.listArtifacts(spaceId)
    }
    return httpRequest('GET', `/api/spaces/${spaceId}/artifacts`)
  },

  listArtifactsTree: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.listArtifactsTree(spaceId)
    }
    return httpRequest('GET', `/api/spaces/${spaceId}/artifacts/tree`)
  },

  openArtifact: async (filePath: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.openArtifact(filePath)
    }
    // Can't open files remotely
    return { success: false, error: 'Cannot open files in remote mode' }
  },

  showArtifactInFolder: async (filePath: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.showArtifactInFolder(filePath)
    }
    // Can't open folder remotely
    return { success: false, error: 'Cannot open folder in remote mode' }
  },

  // Download artifact (remote mode only - triggers browser download)
  downloadArtifact: (filePath: string): void => {
    if (isElectron()) {
      // In Electron, just open the file
      window.skillsfan.openArtifact(filePath)
      return
    }
    // In remote mode, trigger download via browser with token in URL
    const token = getAuthToken()
    const url = `/api/artifacts/download?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token || '')}`
    const link = document.createElement('a')
    link.href = url
    link.download = filePath.split('/').pop() || 'download'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },

  // Get download URL for an artifact (for use with fetch or direct links)
  getArtifactDownloadUrl: (filePath: string): string => {
    const token = getAuthToken()
    return `/api/artifacts/download?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token || '')}`
  },

  // Read artifact content for Content Canvas
  readArtifactContent: async (filePath: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.readArtifactContent(filePath)
    }
    // In remote mode, fetch content via API
    return httpRequest('GET', `/api/artifacts/content?path=${encodeURIComponent(filePath)}`)
  },

  // ===== Skill =====
  listSkills: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.listSkills()
    }
    return httpRequest('GET', '/api/skills')
  },

  reloadSkills: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.reloadSkills()
    }
    return httpRequest('POST', '/api/skills/reload')
  },

  getSkillsDir: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getSkillsDir()
    }
    return httpRequest('GET', '/api/skills/dir')
  },

  selectSkillArchive: async (): Promise<ApiResponse<string | undefined>> => {
    if (isElectron()) {
      return window.skillsfan.selectSkillArchive()
    }
    return { success: false, error: 'Only available in desktop app' }
  },

  installSkill: async (
    archivePath: string,
    conflictResolution?: 'replace' | 'rename' | 'cancel'
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.installSkill(archivePath, conflictResolution)
    }
    return httpRequest('POST', '/api/skills/install', { archivePath, conflictResolution })
  },

  deleteSkill: async (skillName: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.deleteSkill(skillName)
    }
    return httpRequest('DELETE', `/api/skills/${encodeURIComponent(skillName)}`)
  },

  openSkillFolder: async (skillName: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.openSkillFolder(skillName)
    }
    return { success: false, error: 'Only available in desktop app' }
  },

  // ===== Onboarding =====
  writeOnboardingArtifact: async (
    spaceId: string,
    fileName: string,
    content: string
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.writeOnboardingArtifact(spaceId, fileName, content)
    }
    return httpRequest('POST', `/api/spaces/${spaceId}/onboarding/artifact`, { fileName, content })
  },

  saveOnboardingConversation: async (
    spaceId: string,
    userMessage: string,
    aiResponse: string
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.saveOnboardingConversation(spaceId, userMessage, aiResponse)
    }
    return httpRequest('POST', `/api/spaces/${spaceId}/onboarding/conversation`, { userMessage, aiResponse })
  },

  // ===== Remote Access (Electron only) =====
  enableRemoteAccess: async (port?: number): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.enableRemoteAccess(port)
  },

  disableRemoteAccess: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.disableRemoteAccess()
  },

  enableTunnel: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.enableTunnel()
  },

  disableTunnel: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.disableTunnel()
  },

  getRemoteStatus: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.getRemoteStatus()
  },

  getRemoteQRCode: async (includeToken?: boolean): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.getRemoteQRCode(includeToken)
  },

  setRemotePassword: async (password: string): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.setRemotePassword(password)
  },

  regenerateRemotePassword: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.regenerateRemotePassword()
  },

  // ===== System Settings (Electron only) =====
  getAutoLaunch: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.getAutoLaunch()
  },

  setAutoLaunch: async (enabled: boolean): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.setAutoLaunch(enabled)
  },

  getMinimizeToTray: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.getMinimizeToTray()
  },

  setMinimizeToTray: async (enabled: boolean): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.setMinimizeToTray(enabled)
  },

  // ===== Window (Electron only) =====
  setTitleBarOverlay: async (options: {
    color: string
    symbolColor: string
  }): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: true } // No-op in remote mode
    }
    return window.skillsfan.setTitleBarOverlay(options)
  },

  maximizeWindow: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.maximizeWindow()
  },

  unmaximizeWindow: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.unmaximizeWindow()
  },

  isWindowMaximized: async (): Promise<ApiResponse<boolean>> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.isWindowMaximized()
  },

  toggleMaximizeWindow: async (): Promise<ApiResponse<boolean>> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.toggleMaximizeWindow()
  },

  onWindowMaximizeChange: (callback: (isMaximized: boolean) => void) => {
    if (!isElectron()) {
      return () => { } // No-op in remote mode
    }
    return window.skillsfan.onWindowMaximizeChange(callback)
  },

  // ===== Event Listeners =====
  onAgentMessage: (callback: (data: unknown) => void) =>
    onEvent('agent:message', callback),
  onAgentToolCall: (callback: (data: unknown) => void) =>
    onEvent('agent:tool-call', callback),
  onAgentToolResult: (callback: (data: unknown) => void) =>
    onEvent('agent:tool-result', callback),
  onAgentError: (callback: (data: unknown) => void) =>
    onEvent('agent:error', callback),
  onAgentComplete: (callback: (data: unknown) => void) =>
    onEvent('agent:complete', callback),
  onAgentThought: (callback: (data: unknown) => void) =>
    onEvent('agent:thought', callback),
  onAgentMcpStatus: (callback: (data: unknown) => void) =>
    onEvent('agent:mcp-status', callback),
  onAgentCompact: (callback: (data: unknown) => void) =>
    onEvent('agent:compact', callback),
  onAgentUserQuestion: (callback: (data: unknown) => void) =>
    onEvent('agent:user-question', callback),
  onAgentUserQuestionAnswered: (callback: (data: unknown) => void) =>
    onEvent('agent:user-question-answered', callback),
  onRemoteStatusChange: (callback: (data: unknown) => void) =>
    onEvent('remote:status-change', callback),

  // ===== WebSocket Control =====
  connectWebSocket,
  disconnectWebSocket,
  subscribeToConversation,
  unsubscribeFromConversation,

  // ===== Browser (Embedded Browser for Content Canvas) =====
  // Note: Browser features only available in desktop app (not remote mode)

  createBrowserView: async (viewId: string, url?: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.createBrowserView(viewId, url)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  destroyBrowserView: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.destroyBrowserView(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  destroyAllBrowserViews: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.destroyAllBrowserViews()
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  showBrowserView: async (
    viewId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.showBrowserView(viewId, bounds)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  hideBrowserView: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.hideBrowserView(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  resizeBrowserView: async (
    viewId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.resizeBrowserView(viewId, bounds)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  navigateBrowserView: async (viewId: string, url: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.navigateBrowserView(viewId, url)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  browserGoBack: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.browserGoBack(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  browserGoForward: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.browserGoForward(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  browserReload: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.browserReload(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  browserStop: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.browserStop(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  getBrowserState: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.getBrowserState(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  captureBrowserView: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.captureBrowserView(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  executeBrowserJS: async (viewId: string, code: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.executeBrowserJS(viewId, code)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  setBrowserZoom: async (viewId: string, level: number): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.setBrowserZoom(viewId, level)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  toggleBrowserDevTools: async (viewId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.toggleBrowserDevTools(viewId)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  showBrowserContextMenu: async (options: { viewId: string; url?: string; zoomLevel: number }): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.showBrowserContextMenu(options)
    }
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  onBrowserStateChange: (callback: (data: unknown) => void) =>
    onEvent('browser:state-change', callback),

  onBrowserZoomChanged: (callback: (data: { viewId: string; zoomLevel: number }) => void) =>
    onEvent('browser:zoom-changed', callback as (data: unknown) => void),

  // Canvas Tab Context Menu (native Electron menu)
  showCanvasTabContextMenu: async (options: {
    tabId: string
    tabIndex: number
    tabTitle: string
    tabPath?: string
    tabCount: number
    hasTabsToRight: boolean
  }): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.showCanvasTabContextMenu(options)
    }
    return { success: false, error: 'Native menu only available in desktop app' }
  },

  onCanvasTabAction: (callback: (data: {
    action: 'close' | 'closeOthers' | 'closeToRight' | 'copyPath' | 'refresh'
    tabId?: string
    tabIndex?: number
    tabPath?: string
  }) => void) =>
    onEvent('canvas:tab-action', callback as (data: unknown) => void),

  // AI Browser active view change notification
  // Sent when AI Browser tools create or select a view
  onAIBrowserActiveViewChanged: (callback: (data: { viewId: string; url: string | null; title: string | null }) => void) =>
    onEvent('ai-browser:active-view-changed', callback as (data: unknown) => void),

  // ===== Search =====
  search: async (
    query: string,
    scope: 'conversation' | 'space' | 'global',
    conversationId?: string,
    spaceId?: string
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.search(query, scope, conversationId, spaceId)
    }
    return httpRequest('POST', '/api/search', {
      query,
      scope,
      conversationId,
      spaceId
    })
  },

  cancelSearch: async (): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.cancelSearch()
    }
    return httpRequest('POST', '/api/search/cancel')
  },

  onSearchProgress: (callback: (data: { current: number; total: number; searchId: string }) => void) =>
    onEvent('search:progress', callback),

  onSearchCancelled: (callback: () => void) =>
    onEvent('search:cancelled', callback),

  // ===== Updater (Electron only) =====
  checkForUpdates: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.checkForUpdates()
  },

  installUpdate: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.installUpdate()
  },

  getVersion: async (): Promise<ApiResponse<string>> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.getVersion()
  },

  getUpdateInfo: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.getUpdateInfo()
  },

  openDownloadPage: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.openDownloadPage()
  },

  onUpdaterStatus: (callback: (data: {
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'error'
    currentVersion?: string
    latestVersion?: string | null
    releaseDate?: string | null
    releaseNotes?: string | null
    downloadUrl?: string | null
    downloadPageUrl?: string | null
    errorMessage?: string | null
    lastChecked?: string | null
  }) => void) => {
    if (!isElectron()) {
      return () => { } // No-op in remote mode
    }
    return window.skillsfan.onUpdaterStatus(callback)
  },

  // ===== Overlay (Electron only) =====
  // Used for floating UI elements that need to render above BrowserViews
  showChatCapsuleOverlay: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.showChatCapsuleOverlay()
  },

  hideChatCapsuleOverlay: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.hideChatCapsuleOverlay()
  },

  onCanvasExitMaximized: (callback: () => void) => {
    if (!isElectron()) {
      return () => { } // No-op in remote mode
    }
    return window.skillsfan.onCanvasExitMaximized(callback)
  },

  // ===== Performance Monitoring (Electron only, Developer Tools) =====
  perfStart: async (config?: { sampleInterval?: number; maxSamples?: number }): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.perfStart(config)
  },

  perfStop: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.perfStop()
  },

  perfGetState: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.perfGetState()
  },

  perfGetHistory: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.perfGetHistory()
  },

  perfClearHistory: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.perfClearHistory()
  },

  perfSetConfig: async (config: { enabled?: boolean; sampleInterval?: number; warnOnThreshold?: boolean }): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.perfSetConfig(config)
  },

  perfExport: async (): Promise<ApiResponse<string>> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.perfExport()
  },

  onPerfSnapshot: (callback: (data: unknown) => void) =>
    onEvent('perf:snapshot', callback),

  onPerfWarning: (callback: (data: unknown) => void) =>
    onEvent('perf:warning', callback),

  // Report renderer metrics to main process (for combined monitoring)
  perfReportRendererMetrics: (metrics: {
    fps: number
    frameTime: number
    renderCount: number
    domNodes: number
    eventListeners: number
    jsHeapUsed: number
    jsHeapLimit: number
    longTasks: number
  }): void => {
    if (isElectron()) {
      window.skillsfan.perfReportRendererMetrics(metrics)
    }
  },

  // ===== Git Bash (Windows only, Electron only) =====
  getGitBashStatus: async (): Promise<ApiResponse<{
    found: boolean
    path: string | null
    source: 'system' | 'app-local' | 'env-var' | null
  }>> => {
    if (!isElectron()) {
      // In remote mode, assume Git Bash is available (server handles it)
      return { success: true, data: { found: true, path: null, source: null } }
    }
    return window.skillsfan.getGitBashStatus()
  },

  installGitBash: async (onProgress: (progress: {
    phase: 'downloading' | 'extracting' | 'configuring' | 'done' | 'error'
    progress: number
    message: string
    error?: string
  }) => void): Promise<{ success: boolean; path?: string; error?: string }> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.installGitBash(onProgress)
  },

  openExternal: async (url: string): Promise<void> => {
    if (!isElectron()) {
      // In remote mode, open in new tab
      window.open(url, '_blank')
      return
    }
    return window.skillsfan.openExternal(url)
  },

  // ===== Bootstrap Lifecycle Events (Electron only) =====
  // Used to coordinate renderer initialization with main process service registration
  onBootstrapExtendedReady: (callback: (data: { timestamp: number; duration: number }) => void) => {
    if (!isElectron()) {
      // In remote mode, services are always ready (server handles it)
      // Call callback immediately
      setTimeout(() => callback({ timestamp: Date.now(), duration: 0 }), 0)
      return () => {}
    }
    return window.skillsfan.onBootstrapExtendedReady(callback)
  },

  // ===== Ralph (Loop Task) =====
  ralphCreateTask: async (config: {
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
  }): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.ralphCreateTask(config)
  },

  ralphStart: async (spaceId: string | null, taskId: string): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.ralphStart(spaceId, taskId)
  },

  ralphStop: async (taskId: string): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.ralphStop(taskId)
  },

  ralphGetTask: async (taskId: string): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.ralphGetTask(taskId)
  },

  ralphGetCurrent: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.ralphGetCurrent()
  },

  ralphGenerateStories: async (config: {
    projectDir: string
    description: string
  }): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.ralphGenerateStories(config)
  },

  ralphImportPrd: async (config: { projectDir: string }): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.ralphImportPrd(config)
  },

  ralphPrdExists: async (projectDir: string): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.ralphPrdExists(projectDir)
  },

  onRalphTaskUpdate: (callback: (data: { task: unknown }) => void) => {
    if (!isElectron()) {
      return () => {}
    }
    return window.skillsfan.onRalphTaskUpdate(callback)
  },

  onRalphStoryLog: (callback: (data: { taskId: string; storyId: string; log: string }) => void) => {
    if (!isElectron()) {
      return () => {}
    }
    return window.skillsfan.onRalphStoryLog(callback)
  },

  // ===== Loop Task (persistent storage) =====
  loopTaskList: async (spaceId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskList(spaceId)
    }
    return httpRequest('GET', `/api/spaces/${spaceId}/loop-tasks`)
  },

  loopTaskCreate: async (
    spaceId: string,
    config: {
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
    }
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskCreate(spaceId, config)
    }
    return httpRequest('POST', `/api/spaces/${spaceId}/loop-tasks`, config)
  },

  loopTaskGet: async (spaceId: string, taskId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskGet(spaceId, taskId)
    }
    return httpRequest('GET', `/api/spaces/${spaceId}/loop-tasks/${taskId}`)
  },

  loopTaskUpdate: async (
    spaceId: string,
    taskId: string,
    updates: Record<string, unknown>
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskUpdate(spaceId, taskId, updates)
    }
    return httpRequest('PUT', `/api/spaces/${spaceId}/loop-tasks/${taskId}`, updates)
  },

  loopTaskRename: async (spaceId: string, taskId: string, name: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskRename(spaceId, taskId, name)
    }
    return httpRequest('POST', `/api/spaces/${spaceId}/loop-tasks/${taskId}/rename`, { name })
  },

  loopTaskDelete: async (spaceId: string, taskId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskDelete(spaceId, taskId)
    }
    return httpRequest('DELETE', `/api/spaces/${spaceId}/loop-tasks/${taskId}`)
  },

  loopTaskAddStory: async (
    spaceId: string,
    taskId: string,
    story: {
      title: string
      description: string
      acceptanceCriteria: string[]
      priority: number
      notes: string
    }
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskAddStory(spaceId, taskId, story)
    }
    return httpRequest('POST', `/api/spaces/${spaceId}/loop-tasks/${taskId}/stories`, story)
  },

  loopTaskUpdateStory: async (
    spaceId: string,
    taskId: string,
    storyId: string,
    updates: Record<string, unknown>
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskUpdateStory(spaceId, taskId, storyId, updates)
    }
    return httpRequest('PUT', `/api/spaces/${spaceId}/loop-tasks/${taskId}/stories/${storyId}`, updates)
  },

  loopTaskRemoveStory: async (spaceId: string, taskId: string, storyId: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskRemoveStory(spaceId, taskId, storyId)
    }
    return httpRequest('DELETE', `/api/spaces/${spaceId}/loop-tasks/${taskId}/stories/${storyId}`)
  },

  loopTaskReorderStories: async (
    spaceId: string,
    taskId: string,
    fromIndex: number,
    toIndex: number
  ): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskReorderStories(spaceId, taskId, fromIndex, toIndex)
    }
    return httpRequest('POST', `/api/spaces/${spaceId}/loop-tasks/${taskId}/stories/reorder`, { fromIndex, toIndex })
  },

  loopTaskExportPrd: async (config: {
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
  }): Promise<ApiResponse<{ path: string }>> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskExportPrd(config)
    }
    return httpRequest('POST', '/api/loop-tasks/export-prd', config)
  },

  loopTaskDeletePrd: async (prdPath: string): Promise<ApiResponse> => {
    if (isElectron()) {
      return window.skillsfan.loopTaskDeletePrd(prdPath)
    }
    return httpRequest('DELETE', '/api/loop-tasks/prd', { prdPath })
  },

  readFile: async (filePath: string): Promise<ApiResponse<string>> => {
    if (isElectron()) {
      return window.skillsfan.readFile(filePath)
    }
    return httpRequest('POST', '/api/files/read', { filePath })
  },

  // ===== SkillsFan Account Auth (Electron only) =====
  skillsfanStartLogin: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.skillsfanStartLogin()
  },

  skillsfanLogout: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.skillsfanLogout()
  },

  skillsfanGetUser: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.skillsfanGetUser()
  },

  skillsfanGetAuthState: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.skillsfanGetAuthState()
  },

  skillsfanIsLoggedIn: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.skillsfanIsLoggedIn()
  },

  skillsfanRefreshToken: async (): Promise<ApiResponse> => {
    if (!isElectron()) {
      return { success: false, error: 'Only available in desktop app' }
    }
    return window.skillsfan.skillsfanRefreshToken()
  },

  onSkillsFanLoginSuccess: (callback: (data: { user: unknown }) => void) => {
    if (!isElectron()) {
      return () => {}
    }
    return window.skillsfan.onSkillsFanLoginSuccess(callback)
  },

  onSkillsFanLoginError: (callback: (data: { error: string }) => void) => {
    if (!isElectron()) {
      return () => {}
    }
    return window.skillsfan.onSkillsFanLoginError(callback)
  },

  onSkillsFanLogout: (callback: () => void) => {
    if (!isElectron()) {
      return () => {}
    }
    return window.skillsfan.onSkillsFanLogout(callback)
  },
}

// Export type for the API
export type HaloApi = typeof api
