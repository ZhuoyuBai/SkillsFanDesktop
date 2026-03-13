import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  readdirSync
} from 'node:fs'
import { join } from 'node:path'
import type {
  StepReport,
  StepReportInput,
  StepReporterRuntime
} from '../types'

export interface StepJournalPersistenceStatus {
  enabled: boolean
  dir: string | null
  inMemoryTaskCount: number
  persistedTaskCount: number
  persistedStepCount: number
  journalFileCount: number
  lastRecoveredTaskId: string | null
  lastLoadedAt: string | null
  lastPersistedAt: string | null
  lastLoadError: string | null
  lastPersistError: string | null
}

export class InMemoryStepReporterRuntime implements StepReporterRuntime {
  private readonly reportsByTask = new Map<string, StepReport[]>()
  private persistenceDir: string | null = null
  private lastRecoveredTaskId: string | null = null
  private lastLoadedAt: string | null = null
  private lastPersistedAt: string | null = null
  private lastLoadError: string | null = null
  private lastPersistError: string | null = null

  setPersistenceDir(dir: string): void {
    this.persistenceDir = dir
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  recordStep(input: StepReportInput): StepReport {
    const report: StepReport = {
      taskId: input.taskId,
      stepId: input.stepId || randomUUID(),
      timestamp: input.timestamp || Date.now(),
      category: input.category,
      action: input.action,
      summary: input.summary,
      artifacts: input.artifacts,
      metadata: input.metadata
    }

    const existing = this.reportsByTask.get(input.taskId) || []
    existing.push(report)
    this.reportsByTask.set(input.taskId, existing)

    this.persistStepAsync(report)

    return report
  }

  listSteps(taskId: string): StepReport[] {
    const inMemory = this.reportsByTask.get(taskId)
    if (inMemory && inMemory.length > 0) {
      return [...inMemory]
    }

    return this.loadStepsFromDisk(taskId)
  }

  listTaskIds(): string[] {
    const taskIds = new Set<string>(this.reportsByTask.keys())

    for (const taskId of this.listPersistedTaskIds()) {
      taskIds.add(taskId)
    }

    return Array.from(taskIds).sort((left, right) => left.localeCompare(right))
  }

  hasInMemoryTask(taskId: string): boolean {
    return this.reportsByTask.has(taskId)
  }

  hasPersistedTask(taskId: string): boolean {
    if (!this.persistenceDir) {
      return false
    }

    return existsSync(join(this.persistenceDir, `${taskId}.jsonl`))
  }

  loadStepsFromDisk(taskId: string): StepReport[] {
    if (!this.persistenceDir) return []

    const filePath = join(this.persistenceDir, `${taskId}.jsonl`)
    if (!existsSync(filePath)) return []

    try {
      const content = readFileSync(filePath, 'utf-8')
      const steps = content
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as StepReport)

      this.reportsByTask.set(taskId, steps)
      this.lastRecoveredTaskId = taskId
      this.lastLoadedAt = new Date().toISOString()
      this.lastLoadError = null
      return [...steps]
    } catch (error) {
      this.lastRecoveredTaskId = taskId
      this.lastLoadedAt = new Date().toISOString()
      this.lastLoadError = error instanceof Error ? error.message : String(error)
      return []
    }
  }

  clearTask(taskId: string): void {
    this.reportsByTask.delete(taskId)
  }

  clearAll(): void {
    this.reportsByTask.clear()
  }

  getPersistenceStatus(): StepJournalPersistenceStatus {
    const journalStats = this.getJournalStats()

    return {
      enabled: Boolean(this.persistenceDir),
      dir: this.persistenceDir,
      inMemoryTaskCount: this.reportsByTask.size,
      persistedTaskCount: journalStats.persistedTaskCount,
      persistedStepCount: journalStats.persistedStepCount,
      journalFileCount: journalStats.journalFileCount,
      lastRecoveredTaskId: this.lastRecoveredTaskId,
      lastLoadedAt: this.lastLoadedAt,
      lastPersistedAt: this.lastPersistedAt,
      lastLoadError: this.lastLoadError,
      lastPersistError: this.lastPersistError
    }
  }

  private persistStepAsync(report: StepReport): void {
    if (!this.persistenceDir) return

    try {
      const filePath = join(this.persistenceDir, `${report.taskId}.jsonl`)
      const stepWithoutPreviewData = this.stripLargePreviewData(report)
      appendFileSync(filePath, JSON.stringify(stepWithoutPreviewData) + '\n')
      this.lastPersistedAt = new Date().toISOString()
      this.lastPersistError = null
    } catch (error) {
      this.lastPersistError = error instanceof Error ? error.message : String(error)
      // Persistence is best-effort, don't block the step recording
    }
  }

  private stripLargePreviewData(report: StepReport): StepReport {
    if (!report.artifacts) return report

    return {
      ...report,
      artifacts: report.artifacts.map((artifact) => {
        if (artifact.previewImageData && artifact.previewImageData.length > 1000) {
          return {
            ...artifact,
            previewImageData: undefined,
            metadata: {
              ...artifact.metadata,
              hadPreviewImage: true
            }
          }
        }
        return artifact
      })
    }
  }

  private getJournalStats(): {
    persistedTaskCount: number
    persistedStepCount: number
    journalFileCount: number
  } {
    if (!this.persistenceDir || !existsSync(this.persistenceDir)) {
      return {
        persistedTaskCount: 0,
        persistedStepCount: 0,
        journalFileCount: 0
      }
    }

    let persistedStepCount = 0
    const journalFiles = this.listPersistedTaskIds().map((taskId) => `${taskId}.jsonl`)

    for (const fileName of journalFiles) {
      try {
        const content = readFileSync(join(this.persistenceDir, fileName), 'utf-8')
        persistedStepCount += content
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .length
      } catch (error) {
        this.lastPersistError = error instanceof Error ? error.message : String(error)
      }
    }

    return {
      persistedTaskCount: journalFiles.length,
      persistedStepCount,
      journalFileCount: journalFiles.length
    }
  }

  private listPersistedTaskIds(): string[] {
    if (!this.persistenceDir || !existsSync(this.persistenceDir)) {
      return []
    }

    return readdirSync(this.persistenceDir)
      .filter((fileName) => fileName.endsWith('.jsonl'))
      .map((fileName) => fileName.slice(0, -'.jsonl'.length))
      .sort((left, right) => left.localeCompare(right))
  }
}

export const stepReporterRuntime = new InMemoryStepReporterRuntime()
