import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { executeTextEditorCommand } from '../../../../src/main/services/local-tools/text-editor'

describe('local text editor', () => {
  let workDir = ''

  afterEach(() => {
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true })
      workDir = ''
    }
  })

  it('views a selected file range', async () => {
    workDir = mkdtempSync(join(tmpdir(), 'skillsfan-local-tools-'))
    const filePath = join(workDir, 'notes.txt')
    writeFileSync(filePath, 'line1\nline2\nline3\nline4', 'utf-8')

    const result = await executeTextEditorCommand({
      workDir,
      command: 'view',
      path: 'notes.txt',
      view_range: [2, 3]
    })

    expect(result).toMatchObject({
      command: 'view',
      path: 'notes.txt',
      startLine: 2,
      endLine: 3,
      content: 'line2\nline3'
    })
  })

  it('creates and replaces file content', async () => {
    workDir = mkdtempSync(join(tmpdir(), 'skillsfan-local-tools-'))

    const created = await executeTextEditorCommand({
      workDir,
      command: 'create',
      path: 'docs/spec.txt',
      file_text: 'alpha\nbeta\ngamma'
    })

    expect(created).toMatchObject({
      command: 'create',
      path: 'docs/spec.txt',
      isFileUpdate: false
    })

    const replaced = await executeTextEditorCommand({
      workDir,
      command: 'str_replace',
      path: 'docs/spec.txt',
      old_str: 'beta',
      new_str: 'delta'
    })

    expect(replaced).toMatchObject({
      command: 'str_replace',
      path: 'docs/spec.txt',
      oldStart: 2,
      oldLines: 1,
      newStart: 2,
      newLines: 1
    })
    expect(readFileSync(join(workDir, 'docs/spec.txt'), 'utf-8')).toContain('delta')
  })
})
