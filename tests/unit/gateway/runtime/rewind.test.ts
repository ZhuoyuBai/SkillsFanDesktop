import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  canDelegateGatewayCommands: vi.fn(() => false),
  executeGatewayCommand: vi.fn(async () => ({ success: true })),
  rewindFiles: vi.fn(async () => undefined),
  getV2Session: vi.fn(() => ({
    session: {
      rewindFiles: mocks.rewindFiles
    }
  }))
}))

vi.mock('../../../../src/gateway/commands', () => ({
  canDelegateGatewayCommands: mocks.canDelegateGatewayCommands,
  executeGatewayCommand: mocks.executeGatewayCommand
}))

vi.mock('../../../../src/main/services/agent/session-manager', () => ({
  getV2Session: mocks.getV2Session
}))

import { rewindGatewayFiles, rewindGatewayFilesLocally } from '../../../../src/gateway/runtime/rewind'

describe('gateway rewind helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.canDelegateGatewayCommands.mockReturnValue(false)
    mocks.executeGatewayCommand.mockResolvedValue({ success: true })
    mocks.getV2Session.mockReturnValue({
      session: {
        rewindFiles: mocks.rewindFiles
      }
    })
  })

  it('rewinds through the local v2 session when the current process owns execution', async () => {
    await expect(rewindGatewayFiles('conv-1', 'msg-1')).resolves.toEqual({
      success: true
    })

    expect(mocks.rewindFiles).toHaveBeenCalledWith('msg-1')
    expect(mocks.executeGatewayCommand).not.toHaveBeenCalled()
  })

  it('delegates rewind through the external gateway command path when configured', async () => {
    mocks.canDelegateGatewayCommands.mockReturnValue(true)

    await expect(rewindGatewayFiles('conv-2', 'msg-2')).resolves.toEqual({
      success: true
    })

    expect(mocks.executeGatewayCommand).toHaveBeenCalledWith('agent.rewind-files', {
      conversationId: 'conv-2',
      userMessageUuid: 'msg-2'
    })
    expect(mocks.rewindFiles).not.toHaveBeenCalled()
  })

  it('returns a structured failure when no local v2 session exists', async () => {
    mocks.getV2Session.mockReturnValue(undefined)

    await expect(rewindGatewayFilesLocally('conv-3', 'msg-3')).resolves.toEqual({
      success: false,
      error: 'No active session for this conversation'
    })
  })
})
