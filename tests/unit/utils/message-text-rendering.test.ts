import { describe, expect, it } from 'vitest'
import {
  normalizeCompactLogText,
  shouldUseCompactLogText,
} from '../../../src/renderer/utils/message-text-rendering'

describe('message-text-rendering', () => {
  it('dedents heavily indented operational text', () => {
    const content = `
      等待发布结果：

      页面已跳转到视频上传界面，说明发布成功

      发布成功！让我关闭浏览器标签
    `

    expect(normalizeCompactLogText(content)).toBe(
      '等待发布结果：\n\n页面已跳转到视频上传界面，说明发布成功\n\n发布成功！让我关闭浏览器标签'
    )
  })

  it('detects compact operational logs', () => {
    const content = `
      • 标题：测试
      • 内容：测试

      现在点击发布按钮：
      Bash(curl -s "http://localhost:3456/eval")
      {"value":"clicked 发布"}
    `

    expect(shouldUseCompactLogText(content, true)).toBe(true)
    expect(shouldUseCompactLogText(content)).toBe(true)
  })

  it('keeps rich markdown in the normal renderer', () => {
    const content = `
## Result

Here is a fenced example:

\`\`\`ts
console.log('hello')
\`\`\`
    `

    expect(shouldUseCompactLogText(content, true)).toBe(false)
  })

  it('does not collapse ordinary markdown bullet answers in strict mode', () => {
    const content = `
- First conclusion
- Second conclusion
- Third conclusion

These are normal answer bullets, not tool logs.
    `

    expect(shouldUseCompactLogText(content)).toBe(false)
  })

  it('keeps inline markdown answers in the normal renderer', () => {
    const content = `
根据最新天气预报，杭州**明天（3月30日）**的天气情况：

- **天气**：中雨转多云
- **气温**：12°C ~ 20°C

Sources:
- [中国气象局 - 杭州天气预报](https://weather.cma.cn/web/weather/58457.html)
    `

    expect(shouldUseCompactLogText(content)).toBe(false)
    expect(shouldUseCompactLogText(content, true)).toBe(false)
  })
})
