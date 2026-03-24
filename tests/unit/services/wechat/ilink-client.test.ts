import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ILinkClient } from '@main/services/wechat/ilink-client'

describe('ILinkClient', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('wraps outbound messages in the msg envelope required by sendmessage', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ret: 0 })
    })

    const client = new ILinkClient()
    await client.sendText('bot-token', 'user@im.wechat', 'ctx-1', 'hello')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://ilinkai.weixin.qq.com/ilink/bot/sendmessage')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      msg: {
        from_user_id: '',
        to_user_id: 'user@im.wechat',
        message_type: 2,
        message_state: 2,
        context_token: 'ctx-1',
        item_list: [
          { type: 1, text_item: { text: 'hello' } }
        ]
      },
      base_info: {
        channel_version: '1.0.2'
      }
    })
    expect(typeof body.msg.client_id).toBe('string')
    expect(body.msg.client_id.length).toBeGreaterThan(0)
  })

  it('uses channel_version 1.0.2 for getupdates requests', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ret: 0, msgs: [], get_updates_buf: 'cursor-2' })
    })

    const client = new ILinkClient()
    await client.getUpdates('bot-token', 'cursor-1')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      get_updates_buf: 'cursor-1',
      base_info: { channel_version: '1.0.2' }
    })
  })

  it('accepts base_resp.ret style sendmessage responses', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ base_resp: { ret: 0, err_msg: 'ok' } })
    })

    const client = new ILinkClient()
    await expect(client.sendText('bot-token', 'user@im.wechat', 'ctx-1', 'hello')).resolves.toBeUndefined()
  })

  it('treats empty sendmessage responses as success', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => ''
    })

    const client = new ILinkClient()
    await expect(client.sendText('bot-token', 'user@im.wechat', 'ctx-1', 'hello')).resolves.toBeUndefined()
  })

  it('uses the account-specific baseUrl when provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => '{}'
    })

    const client = new ILinkClient()
    await client.sendText(
      'bot-token',
      'user@im.wechat',
      'ctx-1',
      'hello',
      'https://example.wechat.invalid/'
    )

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.wechat.invalid/ilink/bot/sendmessage')
  })

  it('fetches typing config before sending typing indicator', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ typing_ticket: 'ticket-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => ''
      })

    const client = new ILinkClient()
    await client.sendTyping('bot-token', 'user@im.wechat', 'ctx-1')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [configUrl, configInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(configUrl).toBe('https://ilinkai.weixin.qq.com/ilink/bot/getconfig')
    expect(JSON.parse(String(configInit.body))).toEqual({
      ilink_user_id: 'user@im.wechat',
      context_token: 'ctx-1',
      base_info: { channel_version: '1.0.2' }
    })

    const [typingUrl, typingInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(typingUrl).toBe('https://ilinkai.weixin.qq.com/ilink/bot/sendtyping')
    expect(JSON.parse(String(typingInit.body))).toEqual({
      ilink_user_id: 'user@im.wechat',
      typing_ticket: 'ticket-1',
      status: 1,
      base_info: { channel_version: '1.0.2' }
    })
  })
})
