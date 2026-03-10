import { z } from 'zod'
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { executeWebFetch } from './fetch'
import { executeWebSearch } from './search'

function toToolText(payload: unknown): string {
  return JSON.stringify(payload, null, 2)
}

const webSearchTool = tool(
  'WebSearch',
  'Search the web using the app-configured search provider. This is a local platform tool, not a model-native server-side search capability.',
  {
    query: z.string().min(2).describe('Search query'),
    count: z.number().int().min(1).max(10).optional().describe('Maximum results to return'),
    country: z.string().max(10).optional().describe('Country code (e.g. US, CN) or locale like en-US'),
    language: z.string().max(10).optional().describe('Language code (e.g. en, zh) or locale like zh-CN'),
    freshness: z.enum(['day', 'week', 'month', 'year']).optional().describe('Optional freshness filter'),
    domainFilter: z.array(z.string()).max(20).optional().describe('Optional domain filter list; currently supported by Perplexity only')
  },
  async (args) => {
    try {
      const result = await executeWebSearch(args)
      return {
        content: [{ type: 'text' as const, text: toToolText(result) }]
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: (error as Error).message }],
        isError: true
      }
    }
  }
)

const webFetchTool = tool(
  'WebFetch',
  'Fetch a public web page over HTTP and extract readable text using the app-local fetch pipeline.',
  {
    url: z.string().url().describe('Public http/https URL to fetch'),
    maxChars: z.number().int().min(1000).max(100000).optional().describe('Maximum response characters to return')
  },
  async (args) => {
    try {
      const result = await executeWebFetch(args)
      return {
        content: [{ type: 'text' as const, text: toToolText(result) }]
      }
    } catch (error) {
      return {
        content: [{ type: 'text' as const, text: (error as Error).message }],
        isError: true
      }
    }
  }
)

export function createWebToolsMcpServer() {
  return createSdkMcpServer({
    name: 'web-tools',
    version: '1.0.0',
    tools: [webSearchTool, webFetchTool]
  })
}
