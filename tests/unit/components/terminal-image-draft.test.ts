import { describe, expect, it } from 'vitest'

import {
  createTerminalImageToken,
  formatTerminalImagePaths,
  maskTerminalImagePaths,
  relabelTerminalImages,
  rewritePromptOnlySubmittedInputEcho,
  rewriteSubmittedTerminalInputEcho,
  suppressStandaloneSubmittedImageEcho,
  stripTerminalImageTokens,
  type TerminalDraftImage,
} from '../../../src/renderer/components/terminal/terminal-image-draft'

function createImage(index: number): TerminalDraftImage {
  return {
    id: `image-${index}`,
    token: `[Image #${index}]`,
    filePath: `/tmp/image-${index}.png`,
    name: `image-${index}.png`,
    size: 123,
    mediaType: 'image/png',
  }
}

function createSkillsfanImage(index: number): TerminalDraftImage {
  return {
    ...createImage(index),
    filePath: `/Users/zhuoyu/.skillsfan-dev/temp/terminal-images/session-${index}/image-${index}.png`,
  }
}

describe('createTerminalImageToken', () => {
  it('formats placeholder labels with 1-based indexes', () => {
    expect(createTerminalImageToken(2)).toBe('[Image #2]')
  })
})

describe('relabelTerminalImages', () => {
  it('reassigns compact token labels based on order', () => {
    expect(relabelTerminalImages([
      { ...createImage(2), token: '[Image #4]' },
      { ...createImage(4), token: '[Image #9]' },
    ])).toEqual([
      { ...createImage(2), token: '[Image #1]' },
      { ...createImage(4), token: '[Image #2]' },
    ])
  })
})

describe('stripTerminalImageTokens', () => {
  it('removes image placeholders while preserving typed text', () => {
    expect(stripTerminalImageTokens('[Image #1]  compare this [Image #2]')).toBe('compare this')
  })
})

describe('formatTerminalImagePaths', () => {
  it('joins quoted file paths for terminal injection', () => {
    expect(formatTerminalImagePaths([createImage(1), createImage(2)])).toBe(
      '"/tmp/image-1.png" "/tmp/image-2.png"',
    )
  })
})

describe('maskTerminalImagePaths', () => {
  it('replaces quoted paths with visible image tokens', () => {
    expect(maskTerminalImagePaths('review "/tmp/image-1.png"', [createImage(1)])).toBe(
      'review [Image #1]',
    )
  })

  it('replaces raw paths with visible image tokens', () => {
    expect(maskTerminalImagePaths('review /tmp/image-1.png', [createImage(1)])).toBe(
      'review [Image #1]',
    )
  })

  it('replaces wrapped quoted paths with visible image tokens', () => {
    expect(maskTerminalImagePaths('review "/tmp/image-\n1.png"', [createImage(1)])).toBe(
      'review [Image #1]',
    )
  })

  it('replaces relative SkillsFan temp paths with visible image tokens', () => {
    expect(
      maskTerminalImagePaths(
        'Reading 1 file...\n└ .skillsfan-dev/temp/terminal-images/session-1/image-1.png',
        [createSkillsfanImage(1)],
      ),
    ).toBe('Reading 1 file...\n└ [Image #1]')
  })
})

describe('rewriteSubmittedTerminalInputEcho', () => {
  it('rewrites the masked submit echo back to the visible placeholder order', () => {
    expect(
      rewriteSubmittedTerminalInputEcho(
        '> compare this [Image #1]',
        '[Image #1] compare this',
        'compare this',
        [createImage(1)],
      ),
    ).toEqual({
      text: '> [Image #1] compare this',
      rewritten: true,
    })
  })

  it('rewrites image-only submit echoes', () => {
    expect(
      rewriteSubmittedTerminalInputEcho(
        '> [Image #1]',
        '[Image #1]',
        '',
        [createImage(1)],
      ),
    ).toEqual({
      text: '> [Image #1]',
      rewritten: true,
    })
  })

  it('rewrites multiline submit echoes after the path is masked', () => {
    expect(
      rewriteSubmittedTerminalInputEcho(
        '> 这个图片里有什么?\n[Image #1]',
        '[Image #1]这个图片里有什么?',
        '这个图片里有什么?',
        [createImage(1)],
      ),
    ).toEqual({
      text: '> [Image #1]这个图片里有什么?',
      rewritten: true,
    })
  })

  it('rewrites multiline submit echoes that still contain the raw file path', () => {
    expect(
      rewriteSubmittedTerminalInputEcho(
        `> 这个图片里有什么?\n"${createSkillsfanImage(1).filePath}"`,
        '[Image #1]这个图片里有什么?',
        '这个图片里有什么?',
        [createSkillsfanImage(1)],
      ),
    ).toEqual({
      text: '> [Image #1]这个图片里有什么?',
      rewritten: true,
    })
  })
})

describe('rewritePromptOnlySubmittedInputEcho', () => {
  it('rewrites prompt-only echoes to include the visible image token', () => {
    expect(
      rewritePromptOnlySubmittedInputEcho(
        '> 这个图片里有什么?',
        '[Image #1]这个图片里有什么?',
        '这个图片里有什么?',
      ),
    ).toEqual({
      text: '> [Image #1]这个图片里有什么?',
      rewritten: true,
    })
  })
})

describe('suppressStandaloneSubmittedImageEcho', () => {
  it('suppresses a standalone raw file path echo', () => {
    expect(
      suppressStandaloneSubmittedImageEcho(
        `"${createSkillsfanImage(1).filePath}"`,
        [createSkillsfanImage(1)],
      ),
    ).toEqual({
      text: '',
      suppressed: true,
    })
  })

  it('suppresses a standalone token echo', () => {
    expect(
      suppressStandaloneSubmittedImageEcho('[Image #1]', [createImage(1)]),
    ).toEqual({
      text: '',
      suppressed: true,
    })
  })
})
