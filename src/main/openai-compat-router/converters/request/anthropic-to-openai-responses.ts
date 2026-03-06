/**
 * Request Converter: Anthropic -> OpenAI Responses API
 */

import type { AnthropicRequest, OpenAIResponsesRequest } from '../../types'
import {
  convertAnthropicMessagesToResponsesInput,
  extractAnthropicSystemText
} from '../messages'
import {
  convertAnthropicToolsToResponses,
  convertAnthropicToolChoiceToResponses,
  convertAnthropicThinkingToResponsesReasoning
} from '../tools'

export interface ConversionResult {
  request: OpenAIResponsesRequest
  hasImages: boolean
  hasTools: boolean
}

const DEFAULT_RESPONSES_INSTRUCTIONS = 'Follow the provided system and user instructions. Use tools when needed.'

/**
 * Convert Anthropic request to OpenAI Responses API request
 */
export function convertAnthropicToOpenAIResponses(anthropicRequest: AnthropicRequest): ConversionResult {
  // Convert messages to input items
  const inputItems = convertAnthropicMessagesToResponsesInput(anthropicRequest.messages)
  const instructions = extractAnthropicSystemText(anthropicRequest.system) || DEFAULT_RESPONSES_INSTRUCTIONS

  // Check for images in the input
  const hasImages = inputItems.some((item) => {
    if ('content' in item && Array.isArray(item.content)) {
      return item.content.some((part: any) => part.type === 'input_image')
    }
    return false
  })

  // Convert tools
  const tools = convertAnthropicToolsToResponses(anthropicRequest.tools)
  const hasTools = !!tools && tools.length > 0

  // Build request - only include essential parameters
  // Omit max_output_tokens as many providers don't support it
  const request: OpenAIResponsesRequest = {
    model: anthropicRequest.model,
    input: inputItems,
    instructions,
    stream: anthropicRequest.stream
  }

  // Add tools if present
  if (tools && tools.length > 0) {
    request.tools = tools
    request.tool_choice = convertAnthropicToolChoiceToResponses(anthropicRequest.tool_choice)
  }

  // Convert thinking -> reasoning
  if (anthropicRequest.thinking) {
    request.reasoning = convertAnthropicThinkingToResponsesReasoning(anthropicRequest.thinking)
  }

  return {
    request,
    hasImages,
    hasTools
  }
}

/**
 * Simplified conversion that returns just the request
 * (for backward compatibility)
 */
export function convertRequest(anthropicRequest: AnthropicRequest): OpenAIResponsesRequest {
  return convertAnthropicToOpenAIResponses(anthropicRequest).request
}
