import type { BrowserWindow } from 'electron'
import { canDelegateGatewayCommands, executeGatewayCommand } from '../commands'
import type {
  CreateTaskConfig,
  GenerateStoriesConfig,
  RalphTask,
  TaskStatus,
  UserStory
} from '../../main/services/ralph/types'
import {
  createTask as createLegacyRalphTask,
  generateStories as generateLegacyStories,
  getCurrentTask as getLegacyCurrentTask,
  getTask as getLegacyRalphTask,
  importFromPrd as importLegacyFromPrd,
  importFromPrdFile as importLegacyFromPrdFile,
  prdExists as legacyPrdExists,
  setCurrentTask as setLegacyCurrentTask,
  setMainWindow as setLegacyMainWindow,
  startTask as startLegacyRalphTask,
  stopTask as stopLegacyRalphTask
} from '../../main/services/ralph'
import { getTask as getLoopTask } from './loop-task'

export type {
  CreateTaskConfig,
  GenerateStoriesConfig,
  RalphTask,
  TaskStatus,
  UserStory
}

export interface GatewayRalphStatus {
  active: boolean
  taskId: string | null
  status: TaskStatus | null
  currentStoryId: string | null
  iteration: number
  currentLoop: number
}

function toRalphTask(loopTask: ReturnType<typeof getLoopTask>): RalphTask | null {
  if (!loopTask) {
    return null
  }

  return {
    id: loopTask.id,
    projectDir: loopTask.projectDir,
    branchName: loopTask.branchName,
    description: loopTask.description,
    stories: loopTask.stories,
    status: loopTask.status,
    currentStoryIndex: loopTask.currentStoryIndex,
    iteration: loopTask.iteration,
    maxIterations: loopTask.maxIterations,
    model: loopTask.model,
    modelSource: loopTask.modelSource,
    createdAt: loopTask.createdAt,
    startedAt: loopTask.startedAt,
    completedAt: loopTask.completedAt,
    stepRetryConfig: loopTask.stepRetryConfig,
    loopConfig: loopTask.loopConfig,
    currentLoop: loopTask.currentLoop
  }
}

export function setGatewayRalphMainWindow(window: BrowserWindow | null): void {
  setLegacyMainWindow(window)
}

export async function createGatewayRalphTaskLocally(config: CreateTaskConfig): Promise<RalphTask> {
  const task = await createLegacyRalphTask(config)
  setLegacyCurrentTask(task)
  return task
}

export async function createGatewayRalphTask(config: CreateTaskConfig): Promise<RalphTask> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('ralph.create-task', {
      config
    })
  }

  return await createGatewayRalphTaskLocally(config)
}

export function setGatewayRalphCurrentTask(task: RalphTask): void {
  setLegacyCurrentTask(task)
}

export function loadGatewayRalphTaskFromLoopTask(spaceId: string, taskId: string): RalphTask | null {
  const loopTask = getLoopTask(spaceId, taskId)
  const ralphTask = toRalphTask(loopTask)
  if (!ralphTask) {
    return null
  }

  setLegacyCurrentTask(ralphTask)
  return ralphTask
}

export async function startGatewayRalphTaskLocally(taskId: string): Promise<void> {
  await startLegacyRalphTask(taskId)
}

export async function startGatewayRalphTask(taskId: string, options?: {
  spaceId?: string | null
}): Promise<void> {
  if (canDelegateGatewayCommands()) {
    await executeGatewayCommand('ralph.start', {
      spaceId: options?.spaceId ?? null,
      taskId
    })
    return
  }

  await startGatewayRalphTaskLocally(taskId)
}

export async function stopGatewayRalphTaskLocally(taskId: string): Promise<void> {
  await stopLegacyRalphTask(taskId)
}

export async function stopGatewayRalphTask(taskId: string): Promise<void> {
  if (canDelegateGatewayCommands()) {
    await executeGatewayCommand('ralph.stop', {
      taskId
    })
    return
  }

  await stopGatewayRalphTaskLocally(taskId)
}

export async function getGatewayRalphTaskLocally(taskId: string): Promise<RalphTask | null> {
  return await getLegacyRalphTask(taskId)
}

export async function getGatewayRalphTask(taskId: string): Promise<RalphTask | null> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('ralph.get-task', {
      taskId
    })
  }

  return await getGatewayRalphTaskLocally(taskId)
}

export function getGatewayRalphCurrentTaskLocally(): RalphTask | null {
  return getLegacyCurrentTask()
}

export async function getGatewayRalphCurrentTask(): Promise<RalphTask | null> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('ralph.get-current', {})
  }

  return getGatewayRalphCurrentTaskLocally()
}

export function getGatewayRalphStatus(): GatewayRalphStatus {
  const task = getGatewayRalphCurrentTaskLocally()
  const currentStory = task && task.currentStoryIndex >= 0
    ? task.stories[task.currentStoryIndex]
    : null

  return {
    active: task?.status === 'running',
    taskId: task?.id || null,
    status: task?.status || null,
    currentStoryId: currentStory?.id || null,
    iteration: task?.iteration || 0,
    currentLoop: task?.currentLoop || 0
  }
}

export async function generateGatewayRalphStoriesLocally(config: GenerateStoriesConfig): Promise<UserStory[]> {
  return await generateLegacyStories(config)
}

export async function generateGatewayRalphStories(config: GenerateStoriesConfig): Promise<UserStory[]> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('ralph.generate-stories', {
      config
    })
  }

  return await generateGatewayRalphStoriesLocally(config)
}

export async function importGatewayRalphFromPrd(projectDir: string): Promise<RalphTask> {
  return await importLegacyFromPrd(projectDir)
}

export async function importGatewayRalphFromPrdFileLocally(filePath: string): Promise<{
  description: string
  branchName: string
  stories: UserStory[]
}> {
  return await importLegacyFromPrdFile(filePath)
}

export async function importGatewayRalphFromPrdFile(filePath: string): Promise<{
  description: string
  branchName: string
  stories: UserStory[]
}> {
  if (canDelegateGatewayCommands()) {
    return await executeGatewayCommand('ralph.import-prd-file', {
      filePath
    })
  }

  return await importGatewayRalphFromPrdFileLocally(filePath)
}

export async function gatewayRalphPrdExists(projectDir: string): Promise<boolean> {
  return await legacyPrdExists(projectDir)
}
