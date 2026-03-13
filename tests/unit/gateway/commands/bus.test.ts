import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  configureGatewayCommandBus,
  enqueueGatewayCommand,
  executeGatewayCommand,
  listPendingGatewayCommands,
  removeGatewayCommandRequest,
  resetGatewayCommandBusForTests,
  writeGatewayCommandResult
} from '../../../../src/gateway/commands'

describe('gateway command bus', () => {
  const busDir = join(tmpdir(), `skillsfan-gateway-commands-${process.pid}`)

  beforeEach(() => {
    rmSync(busDir, { recursive: true, force: true })
    mkdirSync(busDir, { recursive: true })
    resetGatewayCommandBusForTests()
    configureGatewayCommandBus(busDir)
  })

  afterEach(() => {
    resetGatewayCommandBusForTests()
    rmSync(busDir, { recursive: true, force: true })
  })

  it('enqueues and lists pending gateway commands', () => {
    const command = enqueueGatewayCommand('subagent.kill', { runId: 'run-1' })

    expect(listPendingGatewayCommands()).toEqual([
      expect.objectContaining({
        id: command.id,
        name: 'subagent.kill',
        payload: {
          runId: 'run-1'
        }
      })
    ])
  })

  it('waits for and resolves a command response', async () => {
    const pending = executeGatewayCommand('agent.stop', {
      conversationId: 'conv-1'
    }, {
      timeoutMs: 1_000
    })

    const [command] = listPendingGatewayCommands()
    expect(command?.name).toBe('agent.stop')

    writeGatewayCommandResult(command as any, {
      ok: true,
      data: {
        stopped: true,
        conversationId: 'conv-1'
      }
    })
    removeGatewayCommandRequest(command.id)

    await expect(pending).resolves.toEqual({
      stopped: true,
      conversationId: 'conv-1'
    })
  })
})
