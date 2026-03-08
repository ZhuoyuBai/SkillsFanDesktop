import { describe, expect, it } from 'vitest'
import { executeCodeSnippet, executeShellCommand } from '../../../../src/main/services/local-tools/code-execution'

describe('local code execution', () => {
  it('executes javascript snippets', async () => {
    const result = await executeCodeSnippet({
      workDir: process.cwd(),
      language: 'javascript',
      code: 'console.log("hello from js")'
    })

    expect(result.returnCode).toBe(0)
    expect(result.stdout).toContain('hello from js')
  })

  it('executes shell commands', async () => {
    const result = await executeShellCommand({
      workDir: process.cwd(),
      command: 'printf "hello from shell"'
    })

    expect(result.returnCode).toBe(0)
    expect(result.stdout).toContain('hello from shell')
  })
})
