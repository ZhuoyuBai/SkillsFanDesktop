import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { homedir } from 'os'

import { initializeApp } from '../../../src/main/services/config.service'
import { getWorkingDir } from '../../../src/main/services/pty-credentials'
import { createSpace } from '../../../src/main/services/space.service'

describe('PTY credentials working directory', () => {
  beforeEach(async () => {
    await initializeApp()
  })

  it('uses the home directory for the default temporary space', () => {
    expect(getWorkingDir('skillsfan-temp')).toBe(homedir())
  })

  it('falls back to the home directory when the space cannot be resolved', () => {
    expect(getWorkingDir('missing-space')).toBe(homedir())
  })

  it('keeps custom space paths for project-bound terminals', () => {
    const customPath = path.join(homedir(), 'workspace')
    fs.mkdirSync(customPath, { recursive: true })

    const space = createSpace({
      name: 'Workspace',
      icon: 'folder',
      customPath
    })

    expect(getWorkingDir(space.id)).toBe(customPath)
  })
})
