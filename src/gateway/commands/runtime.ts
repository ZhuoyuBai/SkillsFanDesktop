import {
  listPendingGatewayCommands,
  removeGatewayCommandRequest,
  type GatewayCommandName,
  type GatewayCommandPayloadMap,
  type GatewayCommandResultMap,
  writeGatewayCommandResult
} from './bus'

const COMMAND_RUNTIME_POLL_INTERVAL_MS = 200

export interface GatewayCommandRuntimeStatus {
  initialized: boolean
  processRole: 'desktop-app' | 'external-gateway' | null
  pollIntervalMs: number
  pendingCount: number
  processingCount: number
  processedCount: number
  failedCount: number
  lastCommandName: GatewayCommandName | null
  lastCommandAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastError: string | null
}

let commandRuntimeTimer: NodeJS.Timeout | null = null
let commandRuntimeProcessRole: 'desktop-app' | 'external-gateway' | null = null
const processingCommandIds = new Set<string>()
const commandRuntimeStats: Omit<GatewayCommandRuntimeStatus, 'initialized' | 'processRole' | 'pollIntervalMs' | 'pendingCount' | 'processingCount'> = {
  processedCount: 0,
  failedCount: 0,
  lastCommandName: null,
  lastCommandAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null
}

async function executeGatewayCommandLocally<K extends GatewayCommandName>(
  name: K,
  payload: GatewayCommandPayloadMap[K]
): Promise<GatewayCommandResultMap[K]> {
  switch (name) {
    case 'subagent.kill': {
      const { killSubagentRun } = await import('../../main/services/agent/subagent/runtime')
      const commandPayload = payload as GatewayCommandPayloadMap['subagent.kill']
      return killSubagentRun(commandPayload.runId) as GatewayCommandResultMap[K]
    }

    case 'agent.stop': {
      const { stopGeneration } = await import('../../main/services/agent/control')
      const commandPayload = payload as GatewayCommandPayloadMap['agent.stop']
      await stopGeneration(commandPayload.conversationId)
      return {
        stopped: true,
        conversationId: commandPayload.conversationId || null
      } as GatewayCommandResultMap[K]
    }

    case 'agent.rewind-files': {
      const { rewindGatewayFilesLocally } = await import('../runtime/rewind')
      const commandPayload = payload as GatewayCommandPayloadMap['agent.rewind-files']
      return await rewindGatewayFilesLocally(
        commandPayload.conversationId,
        commandPayload.userMessageUuid
      ) as GatewayCommandResultMap[K]
    }

    case 'agent.send-message': {
      const { sendMessage } = await import('../runtime/orchestrator')
      const commandPayload = payload as GatewayCommandPayloadMap['agent.send-message']

      void sendMessage(null, commandPayload.request).catch((error) => {
        console.error('[Gateway][Commands] agent.send-message failed:', error)
      })

      return {
        accepted: true,
        conversationId: commandPayload.request.conversationId
      } as GatewayCommandResultMap[K]
    }

    case 'agent.ensure-session-warm': {
      const { ensureSessionWarm } = await import('../runtime/orchestrator')
      const commandPayload = payload as GatewayCommandPayloadMap['agent.ensure-session-warm']

      await ensureSessionWarm(
        commandPayload.spaceId,
        commandPayload.conversationId,
        commandPayload.routeHint
      )

      return {
        warmed: true,
        conversationId: commandPayload.conversationId
      } as GatewayCommandResultMap[K]
    }

    case 'agent.interrupt-inject': {
      const { interruptAndInject } = await import('../../main/services/agent/control')
      const commandPayload = payload as GatewayCommandPayloadMap['agent.interrupt-inject']

      void interruptAndInject(null, commandPayload.request).catch((error) => {
        console.error('[Gateway][Commands] agent.interrupt-inject failed:', error)
      })

      return {
        accepted: true,
        conversationId: commandPayload.request.conversationId
      } as GatewayCommandResultMap[K]
    }

    case 'agent.tool-approval': {
      const { handleToolApproval } = await import('../../main/services/agent/permission-handler')
      const commandPayload = payload as GatewayCommandPayloadMap['agent.tool-approval']

      handleToolApproval(commandPayload.conversationId, commandPayload.approved)

      return {
        accepted: true,
        conversationId: commandPayload.conversationId
      } as GatewayCommandResultMap[K]
    }

    case 'agent.question-answer': {
      const { handleUserQuestionAnswer } = await import('../../main/services/agent/permission-handler')
      const commandPayload = payload as GatewayCommandPayloadMap['agent.question-answer']

      handleUserQuestionAnswer(commandPayload.conversationId, commandPayload.answers)

      return {
        accepted: true,
        conversationId: commandPayload.conversationId
      } as GatewayCommandResultMap[K]
    }

    case 'loop-task.retry-story': {
      const { retryStory } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.retry-story']
      const task = retryStory(commandPayload.spaceId, commandPayload.taskId, commandPayload.storyId)
      if (!task) {
        throw new Error('Story not found or not in failed state')
      }
      return task as GatewayCommandResultMap[K]
    }

    case 'loop-task.retry-failed': {
      const { retryFailed } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.retry-failed']
      const task = retryFailed(commandPayload.spaceId, commandPayload.taskId)
      if (!task) {
        throw new Error('Task not found')
      }
      return task as GatewayCommandResultMap[K]
    }

    case 'loop-task.reset-all': {
      const { resetAndRerun } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.reset-all']
      const task = resetAndRerun(commandPayload.spaceId, commandPayload.taskId)
      if (!task) {
        throw new Error('Task not found or currently running')
      }
      return task as GatewayCommandResultMap[K]
    }

    case 'loop-task.delete': {
      const { deleteTask } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.delete']
      const deleted = await deleteTask(commandPayload.spaceId, commandPayload.taskId)
      if (!deleted) {
        throw new Error('Task not found')
      }
      return {
        deleted: true,
        taskId: commandPayload.taskId
      } as GatewayCommandResultMap[K]
    }

    case 'loop-task.create': {
      const { createTask } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.create']
      return createTask(commandPayload.spaceId, commandPayload.config) as GatewayCommandResultMap[K]
    }

    case 'loop-task.update': {
      const { updateTask } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.update']
      const task = updateTask(commandPayload.spaceId, commandPayload.taskId, commandPayload.updates)
      if (!task) {
        throw new Error('Task not found')
      }
      return task as GatewayCommandResultMap[K]
    }

    case 'loop-task.rename': {
      const { renameTask } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.rename']
      const task = renameTask(commandPayload.spaceId, commandPayload.taskId, commandPayload.name)
      if (!task) {
        throw new Error('Task not found')
      }
      return task as GatewayCommandResultMap[K]
    }

    case 'loop-task.add-story': {
      const { addStory } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.add-story']
      const story = addStory(commandPayload.spaceId, commandPayload.taskId, commandPayload.story)
      if (!story) {
        throw new Error('Task not found')
      }
      return story as GatewayCommandResultMap[K]
    }

    case 'loop-task.update-story': {
      const { updateStory } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.update-story']
      const updated = updateStory(
        commandPayload.spaceId,
        commandPayload.taskId,
        commandPayload.storyId,
        commandPayload.updates
      )
      if (!updated) {
        throw new Error('Task or story not found')
      }
      return {
        updated: true,
        taskId: commandPayload.taskId,
        storyId: commandPayload.storyId
      } as GatewayCommandResultMap[K]
    }

    case 'loop-task.remove-story': {
      const { removeStory } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.remove-story']
      const removed = removeStory(
        commandPayload.spaceId,
        commandPayload.taskId,
        commandPayload.storyId
      )
      if (!removed) {
        throw new Error('Task or story not found')
      }
      return {
        removed: true,
        taskId: commandPayload.taskId,
        storyId: commandPayload.storyId
      } as GatewayCommandResultMap[K]
    }

    case 'loop-task.reorder-stories': {
      const { reorderStories } = await import('../../main/services/loop-task.service')
      const commandPayload = payload as GatewayCommandPayloadMap['loop-task.reorder-stories']
      const reordered = reorderStories(
        commandPayload.spaceId,
        commandPayload.taskId,
        commandPayload.fromIndex,
        commandPayload.toIndex
      )
      if (!reordered) {
        throw new Error('Task not found or story indices are invalid')
      }
      return {
        reordered: true,
        taskId: commandPayload.taskId,
        fromIndex: commandPayload.fromIndex,
        toIndex: commandPayload.toIndex
      } as GatewayCommandResultMap[K]
    }

    case 'ralph.create-task': {
      const { createGatewayRalphTaskLocally } = await import('../automation/ralph')
      const commandPayload = payload as GatewayCommandPayloadMap['ralph.create-task']
      return await createGatewayRalphTaskLocally(commandPayload.config) as GatewayCommandResultMap[K]
    }

    case 'ralph.get-task': {
      const { getGatewayRalphTaskLocally } = await import('../automation/ralph')
      const commandPayload = payload as GatewayCommandPayloadMap['ralph.get-task']
      return await getGatewayRalphTaskLocally(commandPayload.taskId) as GatewayCommandResultMap[K]
    }

    case 'ralph.get-current': {
      const { getGatewayRalphCurrentTaskLocally } = await import('../automation/ralph')
      return await getGatewayRalphCurrentTaskLocally() as GatewayCommandResultMap[K]
    }

    case 'ralph.start': {
      const {
        getGatewayRalphTask,
        loadGatewayRalphTaskFromLoopTask,
        startGatewayRalphTaskLocally
      } = await import('../automation/ralph')
      const commandPayload = payload as GatewayCommandPayloadMap['ralph.start']

      if (commandPayload.spaceId) {
        const loaded = loadGatewayRalphTaskFromLoopTask(commandPayload.spaceId, commandPayload.taskId)
        if (!loaded) {
          throw new Error(`Task ${commandPayload.taskId} not found in space ${commandPayload.spaceId}`)
        }
      }

      await startGatewayRalphTaskLocally(commandPayload.taskId)

      return {
        started: true,
        taskId: commandPayload.taskId,
        task: await getGatewayRalphTask(commandPayload.taskId)
      } as GatewayCommandResultMap[K]
    }

    case 'ralph.stop': {
      const { stopGatewayRalphTaskLocally } = await import('../automation/ralph')
      const commandPayload = payload as GatewayCommandPayloadMap['ralph.stop']
      await stopGatewayRalphTaskLocally(commandPayload.taskId)
      return {
        stopped: true,
        taskId: commandPayload.taskId
      } as GatewayCommandResultMap[K]
    }

    case 'ralph.generate-stories': {
      const { generateGatewayRalphStoriesLocally } = await import('../automation/ralph')
      const commandPayload = payload as GatewayCommandPayloadMap['ralph.generate-stories']
      return await generateGatewayRalphStoriesLocally(commandPayload.config) as GatewayCommandResultMap[K]
    }

    case 'ralph.import-prd-file': {
      const { importGatewayRalphFromPrdFileLocally } = await import('../automation/ralph')
      const commandPayload = payload as GatewayCommandPayloadMap['ralph.import-prd-file']
      return await importGatewayRalphFromPrdFileLocally(commandPayload.filePath) as GatewayCommandResultMap[K]
    }

    default: {
      const exhaustiveName: never = name
      throw new Error(`Unsupported gateway command: ${String(exhaustiveName)}`)
    }
  }
}

export async function processGatewayCommandsNow(
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): Promise<void> {
  const processRole = options?.processRole || 'desktop-app'
  if (processRole !== 'external-gateway') {
    return
  }

  commandRuntimeProcessRole = processRole
  const commands = listPendingGatewayCommands()
  for (const command of commands) {
    if (processingCommandIds.has(command.id)) {
      continue
    }

    processingCommandIds.add(command.id)
    commandRuntimeStats.lastCommandName = command.name
    commandRuntimeStats.lastCommandAt = new Date().toISOString()

    try {
      const data = await executeGatewayCommandLocally(command.name, command.payload as any)
      writeGatewayCommandResult(command as any, {
        ok: true,
        data
      })
      commandRuntimeStats.processedCount += 1
      commandRuntimeStats.lastSuccessAt = new Date().toISOString()
      commandRuntimeStats.lastError = null
    } catch (error) {
      writeGatewayCommandResult(command as any, {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      })
      commandRuntimeStats.failedCount += 1
      commandRuntimeStats.lastFailureAt = new Date().toISOString()
      commandRuntimeStats.lastError = error instanceof Error ? error.message : String(error)
    } finally {
      removeGatewayCommandRequest(command.id)
      processingCommandIds.delete(command.id)
    }
  }
}

export function getGatewayCommandRuntimeStatus(): GatewayCommandRuntimeStatus {
  return {
    initialized: Boolean(commandRuntimeTimer),
    processRole: commandRuntimeProcessRole,
    pollIntervalMs: COMMAND_RUNTIME_POLL_INTERVAL_MS,
    pendingCount: listPendingGatewayCommands().length,
    processingCount: processingCommandIds.size,
    processedCount: commandRuntimeStats.processedCount,
    failedCount: commandRuntimeStats.failedCount,
    lastCommandName: commandRuntimeStats.lastCommandName,
    lastCommandAt: commandRuntimeStats.lastCommandAt,
    lastSuccessAt: commandRuntimeStats.lastSuccessAt,
    lastFailureAt: commandRuntimeStats.lastFailureAt,
    lastError: commandRuntimeStats.lastError
  }
}

export function initializeGatewayCommandRuntime(
  options?: { processRole?: 'desktop-app' | 'external-gateway' }
): void {
  const processRole = options?.processRole || 'desktop-app'
  commandRuntimeProcessRole = processRole

  if (processRole !== 'external-gateway') {
    return
  }

  shutdownGatewayCommandRuntime()
  commandRuntimeProcessRole = processRole

  void processGatewayCommandsNow(options)

  commandRuntimeTimer = setInterval(() => {
    void processGatewayCommandsNow(options)
  }, COMMAND_RUNTIME_POLL_INTERVAL_MS)
  commandRuntimeTimer.unref?.()
}

export function shutdownGatewayCommandRuntime(): void {
  if (!commandRuntimeTimer) {
    return
  }

  clearInterval(commandRuntimeTimer)
  commandRuntimeTimer = null
  processingCommandIds.clear()
}

export function resetGatewayCommandRuntimeForTests(): void {
  shutdownGatewayCommandRuntime()
  commandRuntimeProcessRole = null
  commandRuntimeStats.processedCount = 0
  commandRuntimeStats.failedCount = 0
  commandRuntimeStats.lastCommandName = null
  commandRuntimeStats.lastCommandAt = null
  commandRuntimeStats.lastSuccessAt = null
  commandRuntimeStats.lastFailureAt = null
  commandRuntimeStats.lastError = null
}
