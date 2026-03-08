import type { FeishuCardLocale } from './card-builder'

export interface FeishuToolStatusSummary {
  key: string
  text: string
}

type ToolCopy = {
  search: string
  fetch: string
  command: string
  code: string
  edit: string
  memorySearch: string
  memoryWrite: string
  toolSearch: string
  task: string
  using: string
}

const TOOL_COPY: Record<FeishuCardLocale, ToolCopy> = {
  'zh-CN': {
    search: '检索网页',
    fetch: '读取网页',
    command: '执行命令',
    code: '执行代码',
    edit: '编辑文件',
    memorySearch: '检索记忆',
    memoryWrite: '更新记忆',
    toolSearch: '检索工具',
    task: '处理子任务',
    using: '调用工具'
  },
  'zh-TW': {
    search: '檢索網頁',
    fetch: '讀取網頁',
    command: '執行命令',
    code: '執行程式碼',
    edit: '編輯檔案',
    memorySearch: '檢索記憶',
    memoryWrite: '更新記憶',
    toolSearch: '檢索工具',
    task: '處理子任務',
    using: '呼叫工具'
  },
  en: {
    search: 'Searching the web',
    fetch: 'Reading a web page',
    command: 'Running a command',
    code: 'Running code',
    edit: 'Editing a file',
    memorySearch: 'Searching memory',
    memoryWrite: 'Updating memory',
    toolSearch: 'Looking up tools',
    task: 'Working on a subtask',
    using: 'Using'
  }
}

function withDetail(locale: FeishuCardLocale, label: string, detail: string): string {
  return locale === 'en' ? `${label}: ${detail}` : `${label}：${detail}`
}

function trunc(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value
}

function prettifyToolName(name: string): string {
  const compact = name
    .split('__')
    .filter(Boolean)
    .pop() || name

  return compact
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function normalizeToolKey(name: string): string {
  const compact = name
    .split('__')
    .filter(Boolean)
    .pop() || name
  const normalized = compact.replace(/[_-]+/g, '').toLowerCase()

  switch (normalized) {
    case 'websearch':
      return 'web-search'
    case 'webfetch':
      return 'web-fetch'
    case 'bash':
      return 'bash'
    case 'codeexecution':
      return 'code-execution'
    case 'bashcodeexecution':
      return 'bash'
    case 'texteditorcodeexecution':
      return 'text-editor'
    case 'memory':
      return 'memory'
    case 'toolsearchtoolregex':
    case 'toolsearchtoolbm25':
      return 'tool-search'
    case 'task':
      return 'task'
    default:
      return `tool:${normalized}`
  }
}

export function summarizeToolCall(
  locale: FeishuCardLocale,
  name: string,
  input?: Record<string, unknown>
): FeishuToolStatusSummary {
  const copy = TOOL_COPY[locale] ?? TOOL_COPY.en
  const key = normalizeToolKey(name)

  if (key === 'web-search') {
    const query = typeof input?.query === 'string' ? trunc(input.query, 36) : ''
    return {
      key,
      text: query ? `🔎 ${withDetail(locale, copy.search, query)}` : `🔎 ${copy.search}`
    }
  }

  if (key === 'web-fetch') {
    const rawUrl = typeof input?.url === 'string' ? input.url : ''
    if (!rawUrl) {
      return { key, text: `🌐 ${copy.fetch}` }
    }

    try {
      const host = new URL(rawUrl).host.replace(/^www\./, '')
      return { key, text: `🌐 ${withDetail(locale, copy.fetch, trunc(host, 40))}` }
    } catch {
      return { key, text: `🌐 ${withDetail(locale, copy.fetch, trunc(rawUrl, 40))}` }
    }
  }

  if (key === 'bash') {
    const command = typeof input?.command === 'string' ? trunc(input.command, 40) : ''
    return {
      key,
      text: command ? `⚡ ${withDetail(locale, copy.command, command)}` : `⚡ ${copy.command}`
    }
  }

  if (key === 'code-execution') {
    const language = typeof input?.language === 'string' ? input.language : ''
    const code = typeof input?.code === 'string' ? trunc(input.code.split('\n')[0], 40) : ''
    const detail = language || code
    return {
      key,
      text: detail ? `🧪 ${withDetail(locale, copy.code, detail)}` : `🧪 ${copy.code}`
    }
  }

  if (key === 'text-editor') {
    const filePath = typeof input?.path === 'string' ? trunc(input.path, 40) : ''
    return {
      key,
      text: filePath ? `📝 ${withDetail(locale, copy.edit, filePath)}` : `📝 ${copy.edit}`
    }
  }

  if (key === 'memory') {
    const command = typeof input?.command === 'string' ? input.command : ''
    const searchQuery = typeof input?.query === 'string' ? trunc(input.query, 36) : ''
    const memoryPath = typeof input?.path === 'string' ? trunc(input.path, 40) : 'MEMORY.md'

    if (command === 'search') {
      return {
        key,
        text: searchQuery
          ? `🧠 ${withDetail(locale, copy.memorySearch, searchQuery)}`
          : `🧠 ${copy.memorySearch}`
      }
    }

    return {
      key,
      text: `🧠 ${withDetail(locale, copy.memoryWrite, memoryPath)}`
    }
  }

  if (key === 'tool-search') {
    const term = typeof input?.query === 'string'
      ? trunc(input.query, 36)
      : typeof input?.pattern === 'string'
        ? trunc(input.pattern, 36)
        : ''
    return {
      key,
      text: term ? `🧰 ${withDetail(locale, copy.toolSearch, term)}` : `🧰 ${copy.toolSearch}`
    }
  }

  if (key === 'task') {
    const description = typeof input?.description === 'string' ? trunc(input.description, 40) : ''
    return {
      key,
      text: description ? `📋 ${withDetail(locale, copy.task, description)}` : `📋 ${copy.task}`
    }
  }

  const label = prettifyToolName(name)
  if (locale === 'en') {
    return { key, text: `🔧 ${copy.using} ${label}` }
  }
  return { key, text: `🔧 ${copy.using}：${label}` }
}

export function upsertToolSummary(
  existing: FeishuToolStatusSummary[],
  next: FeishuToolStatusSummary
): FeishuToolStatusSummary[] {
  const index = existing.findIndex((item) => item.key === next.key)
  if (index === -1) return [...existing, next]

  const updated = [...existing]
  updated[index] = next
  return updated
}
