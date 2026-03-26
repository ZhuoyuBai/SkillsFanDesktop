// ============================================
// Halo Type Definitions
// ============================================

import type { ThinkingEffort } from '../../shared/utils/openai-models'

// API Provider Configuration
export type ApiProvider = 'anthropic' | 'openai';

// AI Source type - which provider is being used
export type AISourceType = 'oauth' | 'custom' | string;

// Available Claude models
export interface ModelOption {
  id: string;
  name: string;
  description: string;
  estimatedCreditsPerStory?: number; // Rough estimate of credits per story for Loop Tasks
}

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Claude Opus 4.5',
    description: 'Most powerful model, great for complex reasoning and architecture decisions',
    estimatedCreditsPerStory: 15
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    description: 'Balanced performance and cost, suitable for most tasks',
    estimatedCreditsPerStory: 8
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    description: 'Fast and lightweight, ideal for simple tasks',
    estimatedCreditsPerStory: 2
  }
];

export const DEFAULT_MODEL = 'glm-5';

// Permission Level
export type PermissionLevel = 'allow' | 'ask' | 'deny';

// Theme Mode
export type ThemeMode = 'light' | 'dark' | 'system';

// Tool Call Status
export type ToolStatus = 'pending' | 'running' | 'success' | 'error' | 'waiting_approval';

// Message Role
export type MessageRole = 'user' | 'assistant' | 'system';

// ============================================
// Configuration Types
// ============================================

export interface ApiConfig {
  provider: ApiProvider;
  apiKey: string;
  apiUrl: string;
  model: string;
}

export interface PermissionConfig {
  fileAccess: PermissionLevel;
  commandExecution: PermissionLevel;
  networkAccess: PermissionLevel;
  trustMode: boolean;
}

export interface AppearanceConfig {
  theme: ThemeMode;
}

// System configuration for auto-launch and tray behavior
export interface SystemConfig {
  autoLaunch: boolean;      // Launch on system startup
  minimizeToTray: boolean;  // Minimize to tray instead of quitting on window close
}

// Remote access configuration
export interface RemoteAccessConfig {
  enabled: boolean;
  port: number;
}

// ============================================
// AI Sources Configuration (Multi-platform login)
// ============================================

// OAuth provider user info
export interface OAuthUserInfo {
  name: string;
  avatar?: string;
  uid?: string;
}

// OAuth source configuration (generic for any OAuth provider)
export interface OAuthSourceConfig {
  loggedIn: boolean;
  user?: OAuthUserInfo;
  model: string;
  availableModels: string[];
  modelNames?: Record<string, string>;
  // Provider-specific token data - managed by main process
  accessToken?: string;
  refreshToken?: string;
  tokenExpires?: number;
}

// Single API key configuration entry (used in multi-config list)
export interface ApiKeyConfig {
  provider: ApiProvider;
  apiKey: string;
  apiUrl: string;
  model: string;
  label?: string;
}

// Custom API source configuration
// Top-level fields always mirror the active config from configs[activeConfigIndex]
export interface CustomSourceConfig {
  provider: ApiProvider;
  apiKey: string;
  apiUrl: string;
  model: string;
  configs?: ApiKeyConfig[];
  activeConfigIndex?: number;
}

// Sync top-level fields from the active config in configs array
export function syncTopLevelFromActive(config: CustomSourceConfig): CustomSourceConfig {
  if (!config.configs?.length) return config;
  const idx = config.activeConfigIndex ?? 0;
  const active = config.configs[idx];
  if (!active) return config;
  return {
    ...config,
    provider: active.provider,
    apiKey: active.apiKey,
    apiUrl: active.apiUrl,
    model: active.model,
  };
}

// AI Sources - manages multiple login sources
export interface AISourcesConfig {
  current: AISourceType;  // Which source is currently active
  oauth?: OAuthSourceConfig;
  custom?: CustomSourceConfig;
  // Dynamic provider configs (keyed by provider type)
  [key: string]: AISourceType | OAuthSourceConfig | CustomSourceConfig | undefined;
}

// ============================================
// MCP Server Configuration Types
// Format compatible with Cursor / Claude Desktop
// ============================================

// MCP stdio server (command-based, most common)
export interface McpStdioServerConfig {
  type?: 'stdio';  // Optional, defaults to stdio
  command: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;  // milliseconds
  disabled?: boolean;  // Halo extension: temporarily disable this server
}

// MCP HTTP server (REST API)
export interface McpHttpServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  disabled?: boolean;  // Halo extension: temporarily disable this server
}

// MCP SSE server (Server-Sent Events)
export interface McpSseServerConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
  disabled?: boolean;  // Halo extension: temporarily disable this server
}

// Union type for all MCP server configs
export type McpServerConfig = McpStdioServerConfig | McpHttpServerConfig | McpSseServerConfig;

// MCP servers map (key is server name)
export type McpServersConfig = Record<string, McpServerConfig>;

// MCP server status (from SDK)
export type McpServerStatusType = 'connected' | 'failed' | 'needs-auth' | 'pending';

export interface McpServerStatus {
  name: string;
  status: McpServerStatusType;
  serverInfo?: {
    name: string;
    version: string;
  };
  error?: string;
}

// Spaces configuration (default space settings)
export interface SpacesConfig {
  defaultSpaceId: string | null;  // null = Halo space
}

// Memory configuration (cross-conversation memory)
export interface MemoryConfig {
  enabled: boolean;
  retentionDays: number;  // 0 = forever, 7/30/180
}

export interface BrowserAutomationConfig {
  mode: 'ai-browser' | 'system-browser';
}

export interface SkillSettingsConfig {
  preferNativeClaudeSkillTool: boolean;
}

export interface HaloConfig {
  api: ApiConfig;  // Legacy, kept for backward compatibility
  aiSources?: AISourcesConfig;  // New multi-source configuration
  permissions: PermissionConfig;
  appearance: AppearanceConfig;
  system: SystemConfig;
  remoteAccess: RemoteAccessConfig;
  mcpServers: McpServersConfig;  // MCP servers configuration
  spaces?: SpacesConfig;  // Space settings (default space, etc.)
  memory?: MemoryConfig;  // Cross-conversation memory settings
  browserAutomation?: BrowserAutomationConfig;  // Browser automation mode preference
  skillSettings?: SkillSettingsConfig;  // Native Claude Skill tool preference
  thinkingEffort?: ThinkingEffort;  // Default thinking effort level
  customInstructions?: {  // Global custom instructions appended to system prompt
    enabled: boolean;
    content: string;
  };
  isFirstLaunch: boolean;
}

// ============================================
// Space Types
// ============================================

export interface SpaceStats {
  artifactCount: number;
  conversationCount: number;
}

// Layout preferences for a space (persisted to meta.json)
export interface SpaceLayoutPreferences {
  artifactRailExpanded?: boolean;  // Whether rail stays expanded when canvas is open
  chatWidth?: number;              // Custom chat panel width when canvas is open
}

// All space preferences (extensible for future features)
export interface SpacePreferences {
  layout?: SpaceLayoutPreferences;
}

export interface Space {
  id: string;
  name: string;
  icon: string;
  iconColor?: string;  // Custom icon color (hex value or empty for default)
  path: string;
  isTemp: boolean;
  createdAt: string;
  updatedAt: string;
  stats: SpaceStats;
  preferences?: SpacePreferences;  // User preferences for this space
}

export interface CreateSpaceInput {
  name: string;
  icon: string;
  iconColor?: string;  // Custom icon color (hex value or empty for default)
  customPath?: string;
}

// ============================================
// Conversation Types
// ============================================

// Lightweight metadata for conversation list (no messages)
// Used by listConversations for fast loading
export interface ConversationMeta {
  id: string;
  spaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview?: string;  // Last message preview (truncated)
}

// Full conversation with messages
// Loaded on-demand when selecting a conversation
export interface Conversation extends ConversationMeta {
  messages: Message[];
  sessionId?: string;
}

// ============================================
// Message Types
// ============================================

export interface ToolCall {
  id: string;
  name: string;
  status: ToolStatus;
  input: Record<string, unknown>;
  output?: string;
  error?: string;
  progress?: number;
  requiresApproval?: boolean;
  description?: string;
}

// ============================================
// Image Attachment Types (for multi-modal messages)
// ============================================

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// Image attachment for messages
export interface ImageAttachment {
  id: string;
  type: 'image';
  mediaType: ImageMediaType;
  data: string;  // Base64 encoded image data
  name?: string;  // Optional filename
  size?: number;  // File size in bytes
}

// ============================================
// PDF Attachment Types (for document messages)
// ============================================

export interface PdfAttachment {
  id: string;
  type: 'pdf';
  mediaType: 'application/pdf';
  data: string;  // Base64 encoded PDF data
  name: string;
  size: number;
}

// ============================================
// Text/Code Attachment Types (for text-based files)
// ============================================

export interface TextAttachment {
  id: string;
  type: 'text';
  mediaType: string;  // text/plain, text/typescript, etc.
  content: string;    // Raw text content (not Base64)
  name: string;
  size: number;
  language?: string;  // Programming language hint
}

// ============================================
// Union Attachment Type
// ============================================

export type Attachment = ImageAttachment | PdfAttachment | TextAttachment;

// Content block types for multi-modal messages (matches Claude API)
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: ImageMediaType;
    data: string;
  };
}

export type MessageContentBlock = TextContentBlock | ImageContentBlock;

export interface Message {
  id: string;
  role: MessageRole;
  content: string;  // Text content (for backward compatibility)
  timestamp: string;
  toolCalls?: ToolCall[];
  thoughts?: Thought[];  // Agent's reasoning process for this message
  isStreaming?: boolean;
  images?: ImageAttachment[];  // Attached images (legacy, for display)
  attachments?: Attachment[];  // All file attachments (images, PDFs, text/code)
  tokenUsage?: TokenUsage;  // Token usage for this assistant message
  userMessageUuid?: string;  // SDK user message UUID for file rewind support
}

// ============================================
// Artifact Types
// ============================================

export type ArtifactType = 'file' | 'folder';

export interface Artifact {
  id: string;
  spaceId: string;
  conversationId: string;
  name: string;
  type: ArtifactType;
  path: string;
  extension: string;
  icon: string;
  createdAt: string;
  preview?: string;
  size?: number;
}

// Tree node structure for developer view
export interface ArtifactTreeNode {
  id: string;
  name: string;
  type: ArtifactType;
  path: string;
  extension: string;
  icon: string;
  size?: number;
  children?: ArtifactTreeNode[];
  depth: number;
}

// View mode for artifact display
export type ArtifactViewMode = 'card' | 'tree';

// ============================================
// Thought Process Types (Agent's real-time reasoning)
// ============================================

export type ThoughtType = 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error';

export interface Thought {
  id: string;
  type: ThoughtType;
  content: string;
  timestamp: string;
  // For tool-related thoughts
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  isError?: boolean;
  // For result thoughts
  duration?: number;
  // Parent-child tool relationship (e.g., TodoWrite inside a Skill)
  parentToolId?: string;
  isSkillInvocation?: boolean;
}

// Legacy alias for backwards compatibility
export interface ThinkingBlock {
  id: string;
  content: string;
  timestamp: string;
  isComplete: boolean;
}

// ============================================
// Canvas Context Types (AI awareness of user's open tabs)
// ============================================

/**
 * Canvas Context - Provides AI with awareness of user's currently open tabs
 * Injected into messages to enable natural language understanding of user context
 */
export interface CanvasContext {
  isOpen: boolean;
  tabCount: number;
  activeTab: {
    type: string;  // 'browser' | 'code' | 'markdown' | 'image' | 'pdf' | 'text' | 'json' | 'csv'
    title: string;
    url?: string;   // For browser/pdf tabs
    path?: string;  // For file tabs
  } | null;
  tabs: Array<{
    type: string;
    title: string;
    url?: string;
    path?: string;
    isActive: boolean;
  }>;
}

// ============================================
// Agent Event Types
// All events now include spaceId and conversationId for multi-session support
// ============================================

// Base event with session identifiers
export interface AgentEventBase {
  spaceId: string;
  conversationId: string;
}

export interface AgentMessageEvent extends AgentEventBase {
  type: 'message';
  content: string;
  isComplete: boolean;
  timestamp?: number;
}

export interface AgentThinkingEvent extends AgentEventBase {
  type: 'thinking';
  thinking: ThinkingBlock;
}

export interface AgentToolCallEvent extends AgentEventBase {
  type: 'tool_call';
  toolCall: ToolCall;
}

export interface AgentToolResultEvent extends AgentEventBase {
  type: 'tool_result';
  toolId: string;
  result: string;
  isError: boolean;
}

export interface AgentErrorEvent extends AgentEventBase {
  type: 'error';
  error: string;
}

// Token usage statistics from SDK result message
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalCostUsd: number;
  contextWindow: number;
}

export interface AgentCompleteEvent extends AgentEventBase {
  type: 'complete';
  duration: number;
  tokenUsage?: TokenUsage | null;
}

export interface AgentThoughtEvent extends AgentEventBase {
  thought: Thought;
}

// Compact notification info (context compression)
export interface CompactInfo {
  trigger: 'manual' | 'auto';
  preTokens: number;
}

export interface AgentCompactEvent extends AgentEventBase {
  type: 'compact';
  trigger: 'manual' | 'auto';
  preTokens: number;
}

export type AgentEvent =
  | AgentMessageEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentErrorEvent
  | AgentCompleteEvent
  | AgentCompactEvent;

// ============================================
// App State Types
// ============================================

export type AppView = 'splash' | 'gitBashSetup' | 'onboarding' | 'setup' | 'space' | 'settings';

export interface AppState {
  view: AppView;
  isLoading: boolean;
  error: string | null;
  config: HaloConfig | null;
}

// ============================================
// IPC Types
// ============================================

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Utility Types
// ============================================

export interface ValidationResult {
  valid: boolean;
  message?: string;
  model?: string;
}

// Default values
export const DEFAULT_CONFIG: HaloConfig = {
  api: {
    provider: 'anthropic',
    apiKey: '',
    apiUrl: 'https://api.anthropic.com',
    model: DEFAULT_MODEL
  },
  aiSources: {
    current: 'glm',  // Default to GLM-5 via SkillsFan
  },
  permissions: {
    fileAccess: 'allow',
    commandExecution: 'ask',
    networkAccess: 'allow',
    trustMode: false
  },
  appearance: {
    theme: 'system'
  },
  system: {
    autoLaunch: false,
    minimizeToTray: false
  },
  remoteAccess: {
    enabled: false,
    port: 3456
  },
  browserAutomation: {
    mode: 'ai-browser'
  },
  skillSettings: {
    preferNativeClaudeSkillTool: true
  },
  tools: {
    web: {
      search: {
        enabled: true,
        apiKey: '',
        maxResults: 5,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15
      },
      fetch: {
        enabled: true,
        maxChars: 15000,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
        maxRedirects: 3,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      }
    }
  },
  mcpServers: {},  // Empty by default
  isFirstLaunch: true
};

// Helper function to check if any AI source is configured
export function hasAnyAISource(config: HaloConfig): boolean {
  const aiSources = config.aiSources;
  if (!aiSources) {
    return !!config.api?.apiKey;
  }

  // Check legacy custom field
  const hasLegacyCustom = !!(aiSources.custom?.apiKey);

  // Check dynamic provider keys (both OAuth and custom API configs)
  const hasProvider = Object.keys(aiSources).some(key => {
    if (key === 'current' || key === 'custom' || key === 'oauth') return false;
    const source = aiSources[key as keyof typeof aiSources];
    if (!source || typeof source !== 'object') return false;

    // OAuth provider check
    if ('loggedIn' in source && (source as OAuthSourceConfig).loggedIn === true) return true;

    // Custom API provider check (has apiKey)
    if ('apiKey' in source && (source as CustomSourceConfig).apiKey) return true;

    return false;
  });

  return hasProvider || hasLegacyCustom;
}

// Check if a specific AI source is configured (logged in or has API key)
export function isSourceConfigured(aiSources: AISourcesConfig, source: AISourceType): boolean {
  if (source === 'custom') {
    return !!(aiSources.custom?.apiKey);
  }

  const config = aiSources[source as keyof typeof aiSources];
  if (config && typeof config === 'object') {
    if ('loggedIn' in config && (config as OAuthSourceConfig).loggedIn === true) return true;
    if ('apiKey' in config && (config as CustomSourceConfig).apiKey) return true;
  }
  return false;
}

// Helper function to get current model display name
export function getCurrentModelName(config: HaloConfig): string {
  const aiSources = config.aiSources;
  if (!aiSources) {
    const legacyModel = config.api?.model;
    const model = AVAILABLE_MODELS.find(m => m.id === legacyModel);
    return model?.name || legacyModel || 'No model';
  }

  // Check OAuth provider first
  if (aiSources.current === 'oauth' && aiSources.oauth) {
    return aiSources.oauth.model || 'Default';
  }

  // Check custom API
  if (aiSources.current === 'custom' && aiSources.custom) {
    const model = AVAILABLE_MODELS.find(m => m.id === aiSources.custom?.model);
    return model?.name || aiSources.custom.model;
  }

  // Check dynamic provider (from config)
  const dynamicConfig = aiSources[aiSources.current] as OAuthSourceConfig | undefined;
  if (dynamicConfig && typeof dynamicConfig === 'object' && 'model' in dynamicConfig) {
    // For custom API providers with configs[], use the active config's label
    if ('configs' in dynamicConfig) {
      const customCfg = dynamicConfig as unknown as import('../../shared/types/ai-sources').CustomSourceConfig;
      if (customCfg.configs?.length) {
        const activeIdx = customCfg.activeConfigIndex ?? 0;
        const activeCfg = customCfg.configs[activeIdx];
        if (activeCfg?.label) return activeCfg.label;
      }
    }
    const modelId = dynamicConfig.model;
    // Use modelNames mapping if available, otherwise fall back to model ID
    const displayName = dynamicConfig.modelNames?.[modelId] || modelId;
    return displayName || 'Default';
  }

  return 'No model';
}

// Icon options for spaces (using icon IDs that map to Lucide icons)
export const SPACE_ICONS = [
  // Row 1: Work & Code
  'briefcase', 'code-2', 'terminal', 'folder', 'file-text', 'database',
  // Row 2: Creative & Media
  'pen-tool', 'palette', 'camera', 'music', 'image', 'film',
  // Row 3: Communication & Social
  'globe-2', 'message-square', 'mail', 'phone', 'users', 'video',
  // Row 4: Analytics & Business
  'bar-chart', 'pie-chart', 'trending-up', 'target', 'clipboard', 'calendar',
  // Row 5: Learning & Ideas
  'book-open', 'graduation-cap', 'lightbulb', 'brain', 'puzzle', 'flask',
  // Row 6: Lifestyle & Fun
  'heart', 'star', 'coffee', 'gamepad', 'music-2', 'plane',
  // Row 7: Tech & Tools
  'cpu', 'smartphone', 'monitor', 'wifi', 'cloud', 'server',
  // Row 8: Action & Energy
  'zap', 'rocket', 'sparkles', 'flame', 'bolt', 'atom'
] as const;

export type SpaceIconId = typeof SPACE_ICONS[number];

// Default space icon
export const DEFAULT_SPACE_ICON: SpaceIconId = 'briefcase';

// Icon color options for spaces (low saturation, muted colors)
export const SPACE_ICON_COLORS = [
  { id: 'none', value: '', label: '无' },
  { id: 'gray', value: '#9ca3af', label: '灰色' },
  { id: 'rose', value: '#e8a0a0', label: '玫瑰' },
  { id: 'amber', value: '#d4a574', label: '琥珀' },
  { id: 'emerald', value: '#7dba98', label: '翡翠' },
  { id: 'sky', value: '#7db4d4', label: '天空' },
  { id: 'violet', value: '#a89bce', label: '紫罗兰' },
  { id: 'pink', value: '#d4a5c9', label: '粉红' },
] as const;

export type SpaceIconColorId = typeof SPACE_ICON_COLORS[number]['id'];

// Default space icon color
export const DEFAULT_SPACE_ICON_COLOR: SpaceIconColorId = 'none';

// File type to icon ID mapping (maps to Lucide icon names)
export const FILE_ICON_IDS: Record<string, string> = {
  html: 'globe',
  htm: 'globe',
  css: 'palette',
  scss: 'palette',
  less: 'palette',
  js: 'file-code',
  jsx: 'file-code',
  ts: 'file-code',
  tsx: 'file-code',
  json: 'file-json',
  md: 'book',
  markdown: 'book',
  txt: 'file-text',
  py: 'file-code',
  rs: 'cpu',
  go: 'file-code',
  java: 'coffee',
  cpp: 'cpu',
  c: 'cpu',
  h: 'cpu',
  hpp: 'cpu',
  rb: 'gem',
  swift: 'apple',
  sql: 'database',
  sh: 'terminal',
  bash: 'terminal',
  zsh: 'terminal',
  yaml: 'file-json',
  yml: 'file-json',
  xml: 'file-json',
  svg: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  ico: 'image',
  pdf: 'book',
  doc: 'file-text',
  docx: 'file-text',
  xls: 'database',
  xlsx: 'database',
  zip: 'package',
  tar: 'package',
  gz: 'package',
  rar: 'package',
  default: 'file-text'
};

export function getFileIconId(extension: string): string {
  return FILE_ICON_IDS[extension.toLowerCase()] || FILE_ICON_IDS.default;
}

// ============================================
// Linear Stream Types (Claude Code style timeline)
// ============================================

/**
 * Unified timeline item for linear stream display.
 * Merges thoughts, tool calls, and text into a single chronological timeline.
 */
export type TimelineItemType = 'thinking' | 'tool_use' | 'tool_result' | 'text' | 'skill' | 'todo' | 'error';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

export interface TimelineItem {
  id: string;
  timestamp: string;
  type: TimelineItemType;
  // Content fields (based on type)
  content?: string;          // thinking, text, error
  toolName?: string;         // tool_use, tool_result
  toolInput?: Record<string, unknown>;  // tool_use
  toolOutput?: string;       // tool_result
  isError?: boolean;         // tool_result, error
  isComplete?: boolean;      // tool_use: whether completed
  duration?: number;         // tool_use: execution time in ms
  // Special types
  todos?: TodoItem[];        // todo: TodoWrite content
  skillName?: string;        // skill: Skill name
  childItems?: TimelineItem[];  // skill: child tool calls
  parentToolId?: string;     // child tool reference
}

/**
 * Text segment for tracking text content between tool calls.
 * Used to reconstruct the timeline with proper text positioning.
 */
export interface TextSegment {
  content: string;
  timestamp: string;
  startIndex: number;  // Position in streamingContent where this segment starts
}
