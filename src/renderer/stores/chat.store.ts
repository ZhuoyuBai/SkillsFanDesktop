/**
 * Chat Store - Conversation and messaging state
 *
 * Architecture:
 * - spaceStates: Map<spaceId, SpaceState> - conversation metadata organized by space
 * - conversationCache: Map<conversationId, Conversation> - full conversations loaded on-demand
 * - sessions: Map<conversationId, SessionState> - runtime state per conversation (cross-space)
 * - currentSpaceId: pointer to active space
 *
 * Performance optimization:
 * - listConversations returns lightweight ConversationMeta (no messages)
 * - Full conversation loaded on-demand when selecting
 * - LRU cache for recently accessed conversations
 *
 * This allows:
 * - Fast space switching (only metadata loaded)
 * - Space switching without losing session states
 * - Multiple conversations running in parallel across spaces
 * - Clean separation of concerns
 */

import { create } from 'zustand'
import { api } from '../api'
import type { Conversation, ConversationMeta, Message, ToolCall, Artifact, Thought, AgentEventBase, ImageAttachment, Attachment, CompactInfo, CanvasContext, TextSegment } from '../types'
import { hasAnyAISource } from '../types'
import { canvasLifecycle } from '../services/canvas-lifecycle'
import { useAppStore } from './app.store'
import { useToastStore } from './toast.store'
import i18n from '../i18n'

// LRU cache size limit
const CONVERSATION_CACHE_SIZE = 10

// Selection type for switching between conversations and loop tasks
export type SelectionType = 'conversation' | 'loopTask'

// Per-space state (conversations metadata belong to a space)
interface SpaceState {
  conversations: ConversationMeta[]  // Lightweight metadata, no messages
  currentConversationId: string | null
  selectionType: SelectionType  // What type is currently selected
}

// User question info for AskUserQuestion tool
interface UserQuestionInfo {
  toolId: string
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
}

// Per-session runtime state (isolated per conversation, persists across space switches)
interface SessionState {
  isGenerating: boolean
  streamingContent: string
  isStreaming: boolean  // True during token-level text streaming
  thoughts: Thought[]
  isThinking: boolean
  pendingToolApproval: ToolCall | null
  error: string | null
  // Compact notification
  compactInfo: CompactInfo | null
  // UI collapse states for task execution panel
  todoCollapsed: boolean
  activityCollapsed: boolean
  // Task status history (task content -> status updates)
  taskStatusHistory: Map<string, string[]>
  // Linear stream: text segments for timeline reconstruction
  textSegments: TextSegment[]
  lastSegmentIndex: number  // End position of last saved segment
  // Pending user question (AskUserQuestion tool)
  pendingUserQuestion: UserQuestionInfo | null
}

// Create empty session state
function createEmptySessionState(): SessionState {
  return {
    isGenerating: false,
    streamingContent: '',
    isStreaming: false,
    thoughts: [],
    isThinking: false,
    pendingToolApproval: null,
    error: null,
    compactInfo: null,
    todoCollapsed: false,
    activityCollapsed: false,  // Expanded by default - show activity from start
    taskStatusHistory: new Map(),
    textSegments: [],
    lastSegmentIndex: 0,
    pendingUserQuestion: null
  }
}

// Create empty space state
function createEmptySpaceState(): SpaceState {
  return {
    conversations: [],
    currentConversationId: null,
    selectionType: 'conversation'
  }
}

interface ChatState {
  // Per-space state: Map<spaceId, SpaceState>
  spaceStates: Map<string, SpaceState>

  // Conversation cache: Map<conversationId, Conversation>
  // Full conversations loaded on-demand, with LRU eviction
  conversationCache: Map<string, Conversation>

  // Per-session runtime state: Map<conversationId, SessionState>
  // This persists across space switches - background tasks keep running
  sessions: Map<string, SessionState>

  // Current space pointer
  currentSpaceId: string | null

  // Artifacts (per space)
  artifacts: Artifact[]

  // Loading
  isLoading: boolean
  isLoadingConversation: boolean  // Loading full conversation

  // App startup state - used to auto-create new conversation on first space entry
  freshStart: boolean

  // Credits error dialog
  showCreditsError: boolean
  setShowCreditsError: (show: boolean) => void

  // Computed getters
  getCurrentSpaceState: () => SpaceState
  getSpaceState: (spaceId: string) => SpaceState
  getCurrentConversation: () => Conversation | null
  getCurrentConversationMeta: () => ConversationMeta | null
  getCurrentSession: () => SessionState
  getSession: (conversationId: string) => SessionState
  getConversations: () => ConversationMeta[]
  getCurrentConversationId: () => string | null
  getCachedConversation: (conversationId: string) => Conversation | null
  getSelectionType: () => SelectionType

  // Space actions
  setCurrentSpace: (spaceId: string) => void
  setFreshStart: (value: boolean) => void
  setSelectionType: (type: SelectionType) => void

  // Conversation actions
  loadConversations: (spaceId: string) => Promise<void>
  createConversation: (spaceId: string) => Promise<Conversation | null>
  selectConversation: (conversationId: string) => void
  deleteConversation: (spaceId: string, conversationId: string) => Promise<boolean>
  clearAllConversations: (spaceId: string) => Promise<boolean>
  renameConversation: (spaceId: string, conversationId: string, newTitle: string) => Promise<boolean>
  touchConversation: (spaceId: string, conversationId: string) => Promise<boolean>

  // Messaging
  sendMessage: (content: string, attachments?: Attachment[], aiBrowserEnabled?: boolean, thinkingEnabled?: boolean) => Promise<void>
  stopGeneration: (conversationId?: string) => Promise<void>
  injectMessage: (content: string, attachments?: Attachment[]) => Promise<void>

  // Tool approval
  approveTool: (conversationId: string) => Promise<void>
  rejectTool: (conversationId: string) => Promise<void>

  // Task execution panel UI state
  toggleTodoCollapsed: (conversationId: string) => void
  toggleActivityCollapsed: (conversationId: string) => void
  addTaskStatus: (conversationId: string, taskContent: string, status: string) => void

  // Event handlers (called from App component) - with session IDs
  handleAgentStart: (data: AgentEventBase) => void
  handleAgentMessage: (data: AgentEventBase & { content: string; isComplete: boolean }) => void
  handleAgentToolCall: (data: AgentEventBase & ToolCall) => void
  handleAgentToolResult: (data: AgentEventBase & { toolId: string; result: string; isError: boolean }) => void
  handleAgentError: (data: AgentEventBase & { error: string; errorCode?: number }) => void
  handleAgentComplete: (data: AgentEventBase) => void
  handleAgentThought: (data: AgentEventBase & { thought: Thought }) => void
  handleAgentCompact: (data: AgentEventBase & { trigger: 'manual' | 'auto'; preTokens: number }) => void
  handleAgentUserQuestion: (data: AgentEventBase & { toolId: string; questions: UserQuestionInfo['questions'] }) => void
  handleAgentUserQuestionAnswered: (data: AgentEventBase) => void
  answerUserQuestion: (conversationId: string, answers: Record<string, string>) => Promise<void>

  // Cleanup
  reset: () => void
  resetSpace: (spaceId: string) => void
}

// Default empty states
const EMPTY_SESSION: SessionState = createEmptySessionState()
const EMPTY_SPACE_STATE: SpaceState = createEmptySpaceState()

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  spaceStates: new Map<string, SpaceState>(),
  conversationCache: new Map<string, Conversation>(),
  sessions: new Map<string, SessionState>(),
  currentSpaceId: null,
  artifacts: [],
  isLoading: false,
  isLoadingConversation: false,
  freshStart: true,  // App just started - will auto-create new conversation on first space entry

  showCreditsError: false,
  setShowCreditsError: (show) => set({ showCreditsError: show }),

  // Get current space state
  getCurrentSpaceState: () => {
    const { spaceStates, currentSpaceId } = get()
    if (!currentSpaceId) return EMPTY_SPACE_STATE
    return spaceStates.get(currentSpaceId) || EMPTY_SPACE_STATE
  },

  // Get space state by ID
  getSpaceState: (spaceId: string) => {
    const { spaceStates } = get()
    return spaceStates.get(spaceId) || EMPTY_SPACE_STATE
  },

  // Get current conversation (full, from cache)
  getCurrentConversation: () => {
    const spaceState = get().getCurrentSpaceState()
    if (!spaceState.currentConversationId) return null
    return get().conversationCache.get(spaceState.currentConversationId) || null
  },

  // Get current conversation metadata (lightweight)
  getCurrentConversationMeta: () => {
    const spaceState = get().getCurrentSpaceState()
    if (!spaceState.currentConversationId) return null
    return spaceState.conversations.find((c) => c.id === spaceState.currentConversationId) || null
  },

  // Get conversations metadata for current space
  getConversations: () => {
    return get().getCurrentSpaceState().conversations
  },

  // Get current conversation ID
  getCurrentConversationId: () => {
    return get().getCurrentSpaceState().currentConversationId
  },

  // Get cached conversation by ID
  getCachedConversation: (conversationId: string) => {
    return get().conversationCache.get(conversationId) || null
  },

  // Get current selection type
  getSelectionType: () => {
    return get().getCurrentSpaceState().selectionType
  },

  // Get current session state (for the currently viewed conversation)
  getCurrentSession: () => {
    const spaceState = get().getCurrentSpaceState()
    if (!spaceState.currentConversationId) return EMPTY_SESSION
    return get().sessions.get(spaceState.currentConversationId) || EMPTY_SESSION
  },

  // Get session state for any conversation
  getSession: (conversationId: string) => {
    return get().sessions.get(conversationId) || EMPTY_SESSION
  },

  // Set current space (called when entering a space)
  setCurrentSpace: (spaceId: string) => {
    set({ currentSpaceId: spaceId })
  },

  // Set fresh start flag (called after first space entry to disable auto-create)
  setFreshStart: (value: boolean) => {
    set({ freshStart: value })
  },

  // Set selection type (conversation or loopTask)
  setSelectionType: (type) => {
    const { currentSpaceId, spaceStates } = get()
    if (!currentSpaceId) return

    const newSpaceStates = new Map(spaceStates)
    const existingState = newSpaceStates.get(currentSpaceId) || createEmptySpaceState()
    newSpaceStates.set(currentSpaceId, {
      ...existingState,
      selectionType: type
    })
    set({ spaceStates: newSpaceStates })
  },

  // Load conversations for a space (returns lightweight metadata)
  loadConversations: async (spaceId) => {
    try {
      set({ isLoading: true })

      const response = await api.listConversations(spaceId)

      if (response.success && response.data) {
        // Now receives ConversationMeta[] (lightweight, no messages)
        const conversations = response.data as ConversationMeta[]

        set((state) => {
          const newSpaceStates = new Map(state.spaceStates)
          const existingState = newSpaceStates.get(spaceId) || createEmptySpaceState()

          newSpaceStates.set(spaceId, {
            ...existingState,
            conversations
          })

          return { spaceStates: newSpaceStates }
        })
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  // Create new conversation
  createConversation: async (spaceId) => {
    try {
      const response = await api.createConversation(spaceId)

      if (response.success && response.data) {
        const newConversation = response.data as Conversation

        // Extract metadata for the list
        const meta: ConversationMeta = {
          id: newConversation.id,
          spaceId: newConversation.spaceId,
          title: newConversation.title,
          createdAt: newConversation.createdAt,
          updatedAt: newConversation.updatedAt,
          messageCount: newConversation.messages?.length || 0,
          preview: undefined
        }

        set((state) => {
          const newSpaceStates = new Map(state.spaceStates)
          const existingState = newSpaceStates.get(spaceId) || createEmptySpaceState()

          // Add to conversation cache (new conversation is full)
          const newCache = new Map(state.conversationCache)
          newCache.set(newConversation.id, newConversation)

          // LRU eviction
          if (newCache.size > CONVERSATION_CACHE_SIZE) {
            const firstKey = newCache.keys().next().value
            if (firstKey) newCache.delete(firstKey)
          }

          newSpaceStates.set(spaceId, {
            ...existingState,
            conversations: [meta, ...existingState.conversations],
            currentConversationId: newConversation.id,
            selectionType: 'conversation'  // Switch to conversation when creating new
          })

          return { spaceStates: newSpaceStates, conversationCache: newCache }
        })

        // Warm up V2 Session in background - non-blocking
        // When user sends a message, V2 Session is ready to avoid delay
        try {
          api.ensureSessionWarm(spaceId, newConversation.id)
            .catch((error) => console.error('[ChatStore] Session warm up failed:', error))
        } catch (error) {
          console.error('[ChatStore] Failed to trigger session warm up:', error)
        }

        return newConversation
      }

      return null
    } catch (error) {
      console.error('Failed to create conversation:', error)
      return null
    }
  },

  // Select conversation (changes pointer, loads full conversation on-demand)
  selectConversation: async (conversationId) => {
    const { currentSpaceId, spaceStates, conversationCache } = get()
    if (!currentSpaceId) return

    const spaceState = spaceStates.get(currentSpaceId)
    if (!spaceState) return

    const conversationMeta = spaceState.conversations.find((c) => c.id === conversationId)
    if (!conversationMeta) return

    // Subscribe to conversation events (for remote mode)
    api.subscribeToConversation(conversationId)

    // Update the pointer first
    set((state) => {
      const newSpaceStates = new Map(state.spaceStates)
      newSpaceStates.set(currentSpaceId, {
        ...spaceState,
        currentConversationId: conversationId
      })
      return { spaceStates: newSpaceStates }
    })

    // Load full conversation if not in cache
    if (!conversationCache.has(conversationId)) {
      set({ isLoadingConversation: true })
      console.log(`[ChatStore] Loading full conversation: ${conversationId}`)

      try {
        const response = await api.getConversation(currentSpaceId, conversationId)
        if (response.success && response.data) {
          const fullConversation = response.data as Conversation

          set((state) => {
            const newCache = new Map(state.conversationCache)
            newCache.set(conversationId, fullConversation)

            // LRU eviction
            if (newCache.size > CONVERSATION_CACHE_SIZE) {
              const firstKey = newCache.keys().next().value
              if (firstKey) newCache.delete(firstKey)
            }

            return { conversationCache: newCache, isLoadingConversation: false }
          })
          console.log(`[ChatStore] Loaded conversation with ${fullConversation.messages?.length || 0} messages`)
        } else {
          set({ isLoadingConversation: false })
        }
      } catch (error) {
        console.error('[ChatStore] Failed to load conversation:', error)
        set({ isLoadingConversation: false })
      }
    }

    // Check if this conversation has an active session and recover thoughts
    try {
      const response = await api.getSessionState(conversationId)
      if (response.success && response.data) {
        const sessionState = response.data as { isActive: boolean; thoughts: Thought[]; spaceId?: string }

        if (sessionState.isActive && sessionState.thoughts.length > 0) {
          console.log(`[ChatStore] Recovering ${sessionState.thoughts.length} thoughts for conversation ${conversationId}`)

          set((state) => {
            const newSessions = new Map(state.sessions)
            const existingSession = newSessions.get(conversationId) || createEmptySessionState()

            newSessions.set(conversationId, {
              ...existingSession,
              isGenerating: true,
              isThinking: true,
              thoughts: sessionState.thoughts
            })

            return { sessions: newSessions }
          })
        }
      }
    } catch (error) {
      console.error('[ChatStore] Failed to recover session state:', error)
    }

    // Warm up V2 Session in background - non-blocking
    // When user sends a message, V2 Session is ready to avoid delay
    try {
      api.ensureSessionWarm(currentSpaceId, conversationId)
        .catch((error) => console.error('[ChatStore] Session warm up failed:', error))
    } catch (error) {
      console.error('[ChatStore] Failed to trigger session warm up:', error)
    }
  },

  // Delete conversation
  deleteConversation: async (spaceId, conversationId) => {
    try {
      const response = await api.deleteConversation(spaceId, conversationId)

      if (response.success) {
        set((state) => {
          // Clean up session state
          const newSessions = new Map(state.sessions)
          newSessions.delete(conversationId)

          // Clean up cache
          const newCache = new Map(state.conversationCache)
          newCache.delete(conversationId)

          // Update space state
          const newSpaceStates = new Map(state.spaceStates)
          const existingState = newSpaceStates.get(spaceId) || createEmptySpaceState()
          const newConversations = existingState.conversations.filter((c) => c.id !== conversationId)

          newSpaceStates.set(spaceId, {
            ...existingState,
            conversations: newConversations,
            currentConversationId:
              existingState.currentConversationId === conversationId
                ? (newConversations[0]?.id || null)
                : existingState.currentConversationId
          })

          return {
            spaceStates: newSpaceStates,
            sessions: newSessions,
            conversationCache: newCache
          }
        })

        return true
      }

      return false
    } catch (error) {
      console.error('Failed to delete conversation:', error)
      return false
    }
  },

  // Clear all conversations for a space
  clearAllConversations: async (spaceId) => {
    try {
      const response = await api.clearAllConversations(spaceId)

      if (response.success) {
        set((state) => {
          // Get current space state
          const existingState = state.spaceStates.get(spaceId)
          if (!existingState) return state

          // Get all conversation IDs for this space
          const conversationIds = existingState.conversations.map((c) => c.id)

          // Clean up sessions for these conversations
          const newSessions = new Map(state.sessions)
          for (const id of conversationIds) {
            newSessions.delete(id)
          }

          // Clean up cache for these conversations
          const newCache = new Map(state.conversationCache)
          for (const id of conversationIds) {
            newCache.delete(id)
          }

          // Clear conversations and reset current
          const newSpaceStates = new Map(state.spaceStates)
          newSpaceStates.set(spaceId, {
            ...existingState,
            conversations: [],
            currentConversationId: null
          })

          return {
            spaceStates: newSpaceStates,
            sessions: newSessions,
            conversationCache: newCache
          }
        })

        return true
      }

      return false
    } catch (error) {
      console.error('Failed to clear all conversations:', error)
      return false
    }
  },

  // Rename conversation
  renameConversation: async (spaceId, conversationId, newTitle) => {
    try {
      const response = await api.updateConversation(spaceId, conversationId, { title: newTitle })

      if (response.success) {
        set((state) => {
          // Update cache if exists
          const newCache = new Map(state.conversationCache)
          const cached = newCache.get(conversationId)
          if (cached) {
            newCache.set(conversationId, {
              ...cached,
              title: newTitle,
              updatedAt: new Date().toISOString()
            })
          }

          // Update space state metadata
          const newSpaceStates = new Map(state.spaceStates)
          const existingState = newSpaceStates.get(spaceId)
          if (existingState) {
            newSpaceStates.set(spaceId, {
              ...existingState,
              conversations: existingState.conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, title: newTitle, updatedAt: new Date().toISOString() }
                  : c
              )
            })
          }

          return {
            spaceStates: newSpaceStates,
            conversationCache: newCache
          }
        })

        return true
      }

      return false
    } catch (error) {
      console.error('Failed to rename conversation:', error)
      return false
    }
  },

  // Touch conversation (update updatedAt to bring to top)
  touchConversation: async (spaceId, conversationId) => {
    try {
      const response = await api.touchConversation(spaceId, conversationId)

      if (response.success) {
        set((state) => {
          // Update cache if exists
          const newCache = new Map(state.conversationCache)
          const cached = newCache.get(conversationId)
          if (cached) {
            newCache.set(conversationId, {
              ...cached,
              updatedAt: new Date().toISOString()
            })
          }

          // Update space state metadata - move to top of list
          const newSpaceStates = new Map(state.spaceStates)
          const existingState = newSpaceStates.get(spaceId)
          if (existingState) {
            const conversationMeta = existingState.conversations.find((c) => c.id === conversationId)
            if (conversationMeta) {
              // Update timestamp and move to front
              const updatedMeta = { ...conversationMeta, updatedAt: new Date().toISOString() }
              const filtered = existingState.conversations.filter((c) => c.id !== conversationId)
              newSpaceStates.set(spaceId, {
                ...existingState,
                conversations: [updatedMeta, ...filtered]
              })
            }
          }

          return {
            spaceStates: newSpaceStates,
            conversationCache: newCache
          }
        })

        return true
      }

      return false
    } catch (error) {
      console.error('Failed to touch conversation:', error)
      return false
    }
  },

  // Send message (with optional attachments for multi-modal, optional AI Browser and thinking mode)
  sendMessage: async (content, attachments, aiBrowserEnabled, thinkingEnabled) => {
    let conversation = get().getCurrentConversation()
    let conversationMeta = get().getCurrentConversationMeta()
    const { currentSpaceId } = get()

    // Check if space is selected
    if (!currentSpaceId) {
      console.error('[ChatStore] No space selected')
      return
    }

    // If no current conversation, auto-create a new one
    if (!conversation && !conversationMeta) {
      const newConversation = await get().createConversation(currentSpaceId)
      if (!newConversation) {
        console.error('[ChatStore] Failed to create new conversation')
        return
      }
      conversation = newConversation
    }

    const conversationId = conversationMeta?.id || conversation?.id
    if (!conversationId) return

    // Check if AI source is configured before sending message
    const appConfig = useAppStore.getState().config
    const currentAiSource = appConfig?.aiSources?.current
    const currentSourceConfig = currentAiSource ? (appConfig?.aiSources as Record<string, any>)?.[currentAiSource] : undefined
    const isCurrentSourceLoggedIn = currentSourceConfig && typeof currentSourceConfig === 'object' &&
      (('loggedIn' in currentSourceConfig && currentSourceConfig.loggedIn === true) ||
       ('apiKey' in currentSourceConfig && currentSourceConfig.apiKey))

    if (!appConfig || (!hasAnyAISource(appConfig) && !currentAiSource)) {
      console.error('[ChatStore] No AI source configured')
      set((state) => {
        const newSessions = new Map(state.sessions)
        const session = newSessions.get(conversationId) || createEmptySessionState()
        const errorThought: Thought = {
          id: `thought-error-${Date.now()}`,
          type: 'error',
          content: i18n.t('No AI model configured. Please configure a model in Settings.'),
          timestamp: new Date().toISOString(),
          isError: true
        }
        newSessions.set(conversationId, {
          ...session,
          error: i18n.t('No AI model configured'),
          thoughts: [...session.thoughts, errorThought]
        })
        return { sessions: newSessions }
      })
      return
    }

    // Current source is an OAuth provider but not logged in - show toast prompt
    if (currentAiSource && !isCurrentSourceLoggedIn) {
      console.log(`[ChatStore] Current source ${currentAiSource} needs login`)
      useToastStore.getState().addToast(i18n.t('Please log in before using this model'), 'error')
      return
    }

    try {
      // Distinguish first message vs queued message:
      // - First message (not generating): full reset + isThinking for immediate UI feedback
      // - Queued message (already generating): don't touch streaming state
      set((state) => {
        const newSessions = new Map(state.sessions)
        const existingSession = newSessions.get(conversationId) || createEmptySessionState()

        if (existingSession.isGenerating) {
          // Queued message: don't reset streaming state, just clear error
          newSessions.set(conversationId, {
            ...existingSession,
            error: null
          })
        } else {
          // First message: full reset + immediate thinking feedback
          newSessions.set(conversationId, {
            ...existingSession,
            isGenerating: true,
            error: null,
            streamingContent: '',
            isStreaming: false,
            thoughts: [],
            isThinking: true,
            pendingToolApproval: null,
            compactInfo: null,
            textSegments: [],
            lastSegmentIndex: 0
          })
        }
        return { sessions: newSessions }
      })

      // Add user message to UI immediately (update cache if exists)
      // Extract image attachments for backward-compatible display
      const imageAtts = attachments?.filter(a => a.type === 'image') as ImageAttachment[] | undefined
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        images: imageAtts && imageAtts.length > 0 ? imageAtts : undefined,
        attachments: attachments  // Include all attachments
      }

      set((state) => {
        // Update cache if conversation is loaded
        const newCache = new Map(state.conversationCache)
        const cached = newCache.get(conversationId)
        if (cached) {
          newCache.set(conversationId, {
            ...cached,
            messages: [...cached.messages, userMessage],
            updatedAt: new Date().toISOString()
          })
        }

        // Update metadata (messageCount)
        const newSpaceStates = new Map(state.spaceStates)
        const spaceState = newSpaceStates.get(currentSpaceId)
        if (spaceState) {
          newSpaceStates.set(currentSpaceId, {
            ...spaceState,
            conversations: spaceState.conversations.map((c) =>
              c.id === conversationId
                ? { ...c, messageCount: c.messageCount + 1, updatedAt: new Date().toISOString() }
                : c
            )
          })
        }
        return { spaceStates: newSpaceStates, conversationCache: newCache }
      })

      // Build Canvas Context for AI awareness
      // This allows AI to naturally understand what the user is currently viewing
      const buildCanvasContext = (): CanvasContext | undefined => {
        if (!canvasLifecycle.getIsOpen() || canvasLifecycle.getTabCount() === 0) {
          return undefined
        }

        const tabs = canvasLifecycle.getTabs()
        const activeTabId = canvasLifecycle.getActiveTabId()
        const activeTab = canvasLifecycle.getActiveTab()

        return {
          isOpen: true,
          tabCount: tabs.length,
          activeTab: activeTab ? {
            type: activeTab.type,
            title: activeTab.title,
            url: activeTab.url,
            path: activeTab.path
          } : null,
          tabs: tabs.map(t => ({
            type: t.type,
            title: t.title,
            url: t.url,
            path: t.path,
            isActive: t.id === activeTabId
          }))
        }
      }

      // Send to agent (with attachments, AI Browser state, thinking mode, and canvas context)
      const response = await api.sendMessage({
        spaceId: currentSpaceId,
        conversationId,
        message: content,
        images: imageAtts && imageAtts.length > 0 ? imageAtts : undefined,  // Legacy images for backward compat
        attachments: attachments,  // Pass all attachments to API
        aiBrowserEnabled,  // Pass AI Browser state to API
        thinkingEnabled,  // Pass thinking mode to API
        canvasContext: buildCanvasContext()  // Pass canvas context for AI awareness
      })

      // Handle API-level errors (e.g., credential errors that return { success: false })
      if (!response.success) {
        console.error('[ChatStore] API returned error:', response.error)
        set((state) => {
          const newSessions = new Map(state.sessions)
          const session = newSessions.get(conversationId) || createEmptySessionState()
          const errorThought: Thought = {
            id: `thought-error-${Date.now()}`,
            type: 'error',
            content: response.error || i18n.t('Failed to send message'),
            timestamp: new Date().toISOString(),
            isError: true
          }
          newSessions.set(conversationId, {
            ...session,
            error: response.error || i18n.t('Failed to send message'),
            isGenerating: false,
            isThinking: false,
            thoughts: [...session.thoughts, errorThought]
          })
          return { sessions: newSessions }
        })
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      // Update session error state
      set((state) => {
        const newSessions = new Map(state.sessions)
        const session = newSessions.get(conversationId) || createEmptySessionState()
        newSessions.set(conversationId, {
          ...session,
          error: i18n.t('Failed to send message'),
          isGenerating: false,
          isThinking: false
        })
        return { sessions: newSessions }
      })
    }
  },

  // Stop generation for a specific conversation
  stopGeneration: async (conversationId?: string) => {
    const targetId = conversationId || get().getCurrentSpaceState().currentConversationId
    try {
      await api.stopGeneration(targetId)

      if (targetId) {
        set((state) => {
          const newSessions = new Map(state.sessions)
          const session = newSessions.get(targetId)
          if (session) {
            newSessions.set(targetId, {
              ...session,
              isGenerating: false,
              isThinking: false
            })
          }
          return { sessions: newSessions }
        })
      }
    } catch (error) {
      console.error('Failed to stop generation:', error)
    }
  },

  // Inject message during generation (pause current, add user message, continue)
  injectMessage: async (content: string, attachments?: Attachment[]) => {
    const { currentSpaceId } = get()
    const conversation = get().getCurrentConversation()

    if (!currentSpaceId || !conversation) {
      console.error('[ChatStore] Cannot inject: no active conversation')
      return
    }

    const conversationId = conversation.id
    console.log(`[ChatStore] Injecting message into conversation: ${conversationId}`)

    // Extract image attachments for backward-compatible display
    const imageAtts = attachments?.filter(a => a.type === 'image') as ImageAttachment[] | undefined

    // Add user message to UI immediately
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      images: imageAtts && imageAtts.length > 0 ? imageAtts : undefined,
      attachments
    }

    // Update cache with user message
    set((state) => {
      const newCache = new Map(state.conversationCache)
      const cached = newCache.get(conversationId)
      if (cached) {
        newCache.set(conversationId, {
          ...cached,
          messages: [...cached.messages, userMessage],
          updatedAt: new Date().toISOString()
        })
      }
      return { conversationCache: newCache }
    })

    try {
      // Call backend to interrupt and inject
      await api.injectMessage({
        spaceId: currentSpaceId,
        conversationId,
        message: content,
        images: imageAtts && imageAtts.length > 0 ? imageAtts : undefined,
        attachments
      })
    } catch (error) {
      console.error('Failed to inject message:', error)
    }
  },

  // Approve tool for a specific conversation
  approveTool: async (conversationId: string) => {
    try {
      await api.approveTool(conversationId)
      set((state) => {
        const newSessions = new Map(state.sessions)
        const session = newSessions.get(conversationId)
        if (session) {
          newSessions.set(conversationId, { ...session, pendingToolApproval: null })
        }
        return { sessions: newSessions }
      })
    } catch (error) {
      console.error('Failed to approve tool:', error)
    }
  },

  // Reject tool for a specific conversation
  rejectTool: async (conversationId: string) => {
    try {
      await api.rejectTool(conversationId)
      set((state) => {
        const newSessions = new Map(state.sessions)
        const session = newSessions.get(conversationId)
        if (session) {
          newSessions.set(conversationId, { ...session, pendingToolApproval: null })
        }
        return { sessions: newSessions }
      })
    } catch (error) {
      console.error('Failed to reject tool:', error)
    }
  },

  // Toggle todo card collapsed state
  toggleTodoCollapsed: (conversationId: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()
      newSessions.set(conversationId, {
        ...session,
        todoCollapsed: !session.todoCollapsed
      })
      return { sessions: newSessions }
    })
  },

  // Toggle activity section collapsed state
  toggleActivityCollapsed: (conversationId: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()
      newSessions.set(conversationId, {
        ...session,
        activityCollapsed: !session.activityCollapsed
      })
      return { sessions: newSessions }
    })
  },

  // Add task status update to history
  addTaskStatus: (conversationId: string, taskContent: string, status: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()

      const newHistory = new Map(session.taskStatusHistory)
      const existing = newHistory.get(taskContent) || []
      newHistory.set(taskContent, [...existing, status])

      newSessions.set(conversationId, {
        ...session,
        taskStatusHistory: newHistory
      })
      return { sessions: newSessions }
    })
  },

  // Handle agent start - reset session state when a message actually begins executing
  // This is sent by the backend when a queued message starts processing (not when queued)
  handleAgentStart: (data) => {
    const { conversationId } = data
    console.log(`[ChatStore] handleAgentStart [${conversationId}]`)

    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()
      newSessions.set(conversationId, {
        ...session,
        isGenerating: true,
        streamingContent: '',
        isStreaming: false,
        thoughts: [],
        isThinking: true,
        pendingToolApproval: null,
        compactInfo: null,
        textSegments: [],
        lastSegmentIndex: 0
      })
      return { sessions: newSessions }
    })
  },

  // Handle agent message - update session-specific streaming content
  // Backend now sends full accumulated content (all text blocks concatenated)
  handleAgentMessage: (data) => {
    const { conversationId, content, isStreaming } = data as AgentEventBase & {
      content?: string
      isComplete: boolean
      isStreaming?: boolean
    }

    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()

      // Backend sends full accumulated content, just update directly
      const newContent = content ?? session.streamingContent

      console.log(`[ChatStore] handleAgentMessage [${conversationId}]:`, content?.substring(0, 100), `streaming: ${isStreaming}, length: ${newContent?.length || 0}`)

      newSessions.set(conversationId, {
        ...session,
        streamingContent: newContent,
        isStreaming: isStreaming ?? false
      })
      return { sessions: newSessions }
    })
  },

  // Handle tool call for a specific conversation
  handleAgentToolCall: (data) => {
    const { conversationId, ...toolCall } = data
    console.log(`[ChatStore] handleAgentToolCall [${conversationId}]:`, toolCall.name)

    if (toolCall.requiresApproval) {
      set((state) => {
        const newSessions = new Map(state.sessions)
        const session = newSessions.get(conversationId) || createEmptySessionState()
        newSessions.set(conversationId, {
          ...session,
          pendingToolApproval: toolCall as ToolCall
        })
        return { sessions: newSessions }
      })
    }
  },

  // Handle tool result for a specific conversation
  handleAgentToolResult: (data) => {
    const { conversationId, toolId } = data
    console.log(`[ChatStore] handleAgentToolResult [${conversationId}]:`, toolId)
    // Tool results are tracked in thoughts, no additional state needed
  },

  // Handle error for a specific conversation
  handleAgentError: (data) => {
    const { conversationId, error, errorCode } = data
    console.log(`[ChatStore] handleAgentError [${conversationId}]:`, error, 'code:', errorCode)

    // Show credits error dialog for 402 (insufficient credits)
    if (errorCode === 402) {
      set({ showCreditsError: true })
    }

    // Add error thought to session
    const errorThought: Thought = {
      id: `thought-error-${Date.now()}`,
      type: 'error',
      content: error,
      timestamp: new Date().toISOString(),
      isError: true
    }

    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()
      newSessions.set(conversationId, {
        ...session,
        error,
        isGenerating: false,
        isThinking: false,
        thoughts: [...session.thoughts, errorThought]
      })
      return { sessions: newSessions }
    })
  },

  // Handle complete - reload conversation from backend (Single Source of Truth)
  // Key: Only set isGenerating=false AFTER backend data is loaded to prevent flash
  handleAgentComplete: async (data) => {
    const { spaceId, conversationId } = data
    console.log(`[ChatStore] handleAgentComplete [${conversationId}]`)

    // Commit streaming content to cache BEFORE async reload.
    // When lane queue pumps the next message, handleAgentStart clears streamingContent.
    // Without this, msg1's response would be lost between handleAgentStart (clears streaming)
    // and getConversation() completing (restores from backend).
    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId)

      // Save streaming content into conversation cache as a temporary assistant message
      const newCache = new Map(state.conversationCache)
      const cached = newCache.get(conversationId)
      if (cached && session?.streamingContent) {
        const tempAssistant: Message = {
          id: `streaming-complete-${Date.now()}`,
          role: 'assistant',
          content: session.streamingContent,
          timestamp: new Date().toISOString(),
          thoughts: session.thoughts?.length > 0 ? session.thoughts : undefined
        }
        const messages = [...cached.messages]
        const lastMsg = messages[messages.length - 1]
        // Replace empty assistant placeholder if present at end
        if (lastMsg?.role === 'assistant' && !lastMsg.content) {
          messages[messages.length - 1] = tempAssistant
        } else {
          messages.push(tempAssistant)
        }
        newCache.set(conversationId, {
          ...cached,
          messages,
          updatedAt: new Date().toISOString()
        })
      }

      if (session) {
        newSessions.set(conversationId, {
          ...session,
          isStreaming: false,
          isThinking: false
          // Keep isGenerating=true and streamingContent until backend loads
        })
      }
      return { sessions: newSessions, conversationCache: newCache }
    })

    // Reload conversation from backend (Single Source of Truth)
    // Backend has already saved the complete message with thoughts
    try {
      const response = await api.getConversation(spaceId, conversationId)
      if (response.success && response.data) {
        const updatedConversation = response.data as Conversation

        // Extract updated metadata
        const updatedMeta: ConversationMeta = {
          id: updatedConversation.id,
          spaceId: updatedConversation.spaceId,
          title: updatedConversation.title,
          createdAt: updatedConversation.createdAt,
          updatedAt: updatedConversation.updatedAt,
          messageCount: updatedConversation.messages?.length || 0,
          preview: updatedConversation.messages?.length
            ? updatedConversation.messages[updatedConversation.messages.length - 1].content.slice(0, 50)
            : undefined
        }

        // Now atomically: update cache, metadata, AND clear session state
        // This prevents flash by doing all in one render
        set((state) => {
          // Update cache with fresh data from backend
          // Backend saves user messages immediately in sendMessageInternal,
          // so all user messages are already in backend data — no need to preserve optimistic ones
          const newCache = new Map(state.conversationCache)
          newCache.set(conversationId, updatedConversation)

          // Update metadata in space state
          const newSpaceStates = new Map(state.spaceStates)
          const currentSpaceState = newSpaceStates.get(spaceId)
          if (currentSpaceState) {
            newSpaceStates.set(spaceId, {
              ...currentSpaceState,
              conversations: currentSpaceState.conversations.map((c) =>
                c.id === conversationId ? updatedMeta : c
              )
            })
          }

          // Clear session state — but only if next message hasn't already started
          const newSessions = new Map(state.sessions)
          const currentSession = newSessions.get(conversationId)
          if (currentSession) {
            const nextMessageStarted = currentSession.isThinking === true
            if (!nextMessageStarted) {
              newSessions.set(conversationId, {
                ...currentSession,
                isGenerating: false,
                streamingContent: '',
                compactInfo: null
              })
            }
            // If nextMessageStarted, leave session state untouched
          }

          return {
            spaceStates: newSpaceStates,
            sessions: newSessions,
            conversationCache: newCache
          }
        })
        console.log(`[ChatStore] Conversation reloaded from backend [${conversationId}]`)
      }
    } catch (error) {
      console.error('[ChatStore] Failed to reload conversation:', error)
      // Clear state on error — but only if next message hasn't already started
      set((state) => {
        const newSessions = new Map(state.sessions)
        const currentSession = newSessions.get(conversationId)
        if (currentSession) {
          const nextMessageStarted = currentSession.isThinking === true
          if (!nextMessageStarted) {
            newSessions.set(conversationId, {
              ...currentSession,
              isGenerating: false,
              streamingContent: '',
              compactInfo: null
            })
          }
        }
        return { sessions: newSessions }
      })
    }
  },

  // Handle thought for a specific conversation
  handleAgentThought: (data) => {
    const { conversationId, thought } = data
    console.log(`[ChatStore] handleAgentThought [${conversationId}]:`, thought.type, thought.id)

    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()

      // Check if thought with same id already exists (avoid duplicates after recovery)
      const existingIds = new Set(session.thoughts.map(t => t.id))
      if (existingIds.has(thought.id)) {
        console.log(`[ChatStore] Skipping duplicate thought: ${thought.id}`)
        return state // No change
      }

      // Linear stream: save text segment when tool_use appears
      let newTextSegments = session.textSegments
      let newLastSegmentIndex = session.lastSegmentIndex

      if (thought.type === 'tool_use' && session.streamingContent) {
        const currentContent = session.streamingContent
        const newSegmentContent = currentContent.slice(session.lastSegmentIndex)

        // Only save if there's actual content (not just whitespace)
        if (newSegmentContent.trim()) {
          const segment: TextSegment = {
            content: newSegmentContent,
            timestamp: thought.timestamp || new Date().toISOString(),
            startIndex: session.lastSegmentIndex
          }
          newTextSegments = [...session.textSegments, segment]
          newLastSegmentIndex = currentContent.length
          console.log(`[ChatStore] Saved text segment: ${newSegmentContent.slice(0, 50)}...`)
        }
      }

      newSessions.set(conversationId, {
        ...session,
        thoughts: [...session.thoughts, thought],
        isThinking: true,
        isGenerating: true, // Ensure generating state is set
        textSegments: newTextSegments,
        lastSegmentIndex: newLastSegmentIndex
      })
      return { sessions: newSessions }
    })
  },

  // Handle compact notification - context was compressed
  handleAgentCompact: (data) => {
    const { conversationId, trigger, preTokens } = data
    console.log(`[ChatStore] handleAgentCompact [${conversationId}]: trigger=${trigger}, preTokens=${preTokens}`)

    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()

      newSessions.set(conversationId, {
        ...session,
        compactInfo: { trigger, preTokens }
      })
      return { sessions: newSessions }
    })
  },

  // Handle user question from AskUserQuestion tool - pauses execution
  handleAgentUserQuestion: (data) => {
    const { conversationId, toolId, questions } = data
    console.log(`[ChatStore] handleAgentUserQuestion [${conversationId}]: toolId=${toolId}, questions=${questions.length}`)

    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId) || createEmptySessionState()

      newSessions.set(conversationId, {
        ...session,
        pendingUserQuestion: { toolId, questions }
      })
      return { sessions: newSessions }
    })
  },

  // Handle user question answered - clear pending question
  handleAgentUserQuestionAnswered: (data) => {
    const { conversationId } = data
    console.log(`[ChatStore] handleAgentUserQuestionAnswered [${conversationId}]`)

    set((state) => {
      const newSessions = new Map(state.sessions)
      const session = newSessions.get(conversationId)
      if (session) {
        newSessions.set(conversationId, {
          ...session,
          pendingUserQuestion: null
        })
      }
      return { sessions: newSessions }
    })
  },

  // Answer user question (AskUserQuestion tool)
  answerUserQuestion: async (conversationId: string, answers: Record<string, string>) => {
    console.log(`[ChatStore] answerUserQuestion [${conversationId}]:`, Object.keys(answers))
    await api.answerUserQuestion(conversationId, answers)
  },

  // Reset all state (use sparingly - e.g., logout)
  reset: () => {
    set({
      spaceStates: new Map(),
      conversationCache: new Map(),
      sessions: new Map(),
      currentSpaceId: null,
      artifacts: [],
      isLoadingConversation: false
    })
  },

  // Reset a specific space's state (use when needed)
  resetSpace: (spaceId: string) => {
    set((state) => {
      const newSpaceStates = new Map(state.spaceStates)
      newSpaceStates.delete(spaceId)
      return { spaceStates: newSpaceStates }
    })
  }
}))

/**
 * Selector: Get current session's isGenerating state
 * Use this in components that need to react to generation state changes
 */
export function useIsGenerating(): boolean {
  return useChatStore((state) => {
    const spaceState = state.currentSpaceId
      ? state.spaceStates.get(state.currentSpaceId)
      : null
    if (!spaceState?.currentConversationId) return false
    const session = state.sessions.get(spaceState.currentConversationId)
    return session?.isGenerating ?? false
  })
}
