import { randomUUID } from 'node:crypto'
import type {
  StepReport,
  StepReportInput,
  StepReporterRuntime
} from '../types'

export class InMemoryStepReporterRuntime implements StepReporterRuntime {
  private readonly reportsByTask = new Map<string, StepReport[]>()

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
    return report
  }

  listSteps(taskId: string): StepReport[] {
    return [...(this.reportsByTask.get(taskId) || [])]
  }

  clearTask(taskId: string): void {
    this.reportsByTask.delete(taskId)
  }

  clearAll(): void {
    this.reportsByTask.clear()
  }
}

export const stepReporterRuntime = new InMemoryStepReporterRuntime()
