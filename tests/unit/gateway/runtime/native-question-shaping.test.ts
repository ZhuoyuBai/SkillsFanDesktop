import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeNativeQuestionInput } from '../../../../src/gateway/runtime/native/question-shaping'

describe('native question shaping', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rewrites technical project-choice questions into simpler user wording', () => {
    vi.stubEnv('LANG', 'zh_CN.UTF-8')

    expect(normalizeNativeQuestionInput({
      question: 'Please choose the target project directory.',
      options: [
        { label: 'web-app', description: '前台项目' },
        { label: 'admin-panel', description: '后台项目' }
      ]
    })).toEqual({
      question: '你想继续处理哪一个项目？',
      header: '请选择',
      options: [
        { label: 'web-app', description: '前台项目' },
        { label: 'admin-panel', description: '后台项目' }
      ],
      multiSelect: false
    })
  })

  it('keeps already user-friendly questions unchanged', () => {
    vi.stubEnv('LANG', 'zh_CN.UTF-8')

    expect(normalizeNativeQuestionInput({
      question: '你想先整理页面，还是先关掉不相关的页面？',
      header: '请确认',
      options: [
        { label: '先整理页面', description: '先把相关页面集中起来' },
        { label: '先关闭不相关页面', description: '先做清理' }
      ]
    })).toEqual({
      question: '你想先整理页面，还是先关掉不相关的页面？',
      header: '请确认',
      options: [
        { label: '先整理页面', description: '先把相关页面集中起来' },
        { label: '先关闭不相关页面', description: '先做清理' }
      ],
      multiSelect: false
    })
  })
})
