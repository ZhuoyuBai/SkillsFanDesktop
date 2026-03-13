export type NativeUserFacingLocale = 'zh-CN' | 'zh-TW' | 'en'

type NativeUserFacingMessageKey =
  | 'noEndpoint'
  | 'requiresResponses'
  | 'outsideScope'
  | 'openAIReady'
  | 'codexReady'
  | 'sharedToolsNotReady'
  | 'scaffoldReadyButInactive'
  | 'unsupportedInputs'
  | 'noFinalResponse'
  | 'requestFailed'
  | 'incomplete'
  | 'tooManyToolSteps'
  | 'toolInputInvalid'
  | 'defaultQuestionHeader'
  | 'nestedRequestsNotSupported'
  | 'commandDisabled'
  | 'approvalUnavailable'
  | 'questionUnavailable'
  | 'commandRejected'
  | 'providerUnsupported'
  | 'toolUnavailable'
  | 'systemBrowserOnly'
  | 'resolvedModelRequired'
  | 'upstreamRateLimit'
  | 'upstreamAuth'
  | 'upstreamQuota'
  | 'upstreamUnavailable'

const COPY: Record<
  NativeUserFacingLocale,
  Record<NativeUserFacingMessageKey, string | ((params: Record<string, unknown>) => string)>
> = {
  'zh-CN': {
    noEndpoint: '当前没有可用的模型连接，请先检查模型设置。',
    requiresResponses: '当前选择的模型暂时还不能走这条新路线。',
    outsideScope: '当前选择的模型还没加入这一批支持范围。',
    openAIReady: '当前选择的模型已经可以走这条新路线。',
    codexReady: '当前选择的模型已经可以走这条新路线。',
    sharedToolsNotReady: '这条新路线快准备好了，但常用操作还没有全部接好。',
    scaffoldReadyButInactive: '这条新路线已经准备好了，但你当前选择的模型还没切到这里。',
    unsupportedInputs: ({ unsupportedKinds }) =>
      `这次发送的内容里有暂时还不支持的类型：${String(unsupportedKinds)}。现在请先只发送文字或图片。`,
    noFinalResponse: '这次请求提前结束了，没有返回完整结果。请重试一次。',
    requestFailed: '这次请求没有顺利完成，请稍后再试。',
    incomplete: ({ reason }) =>
      typeof reason === 'string' && reason.trim()
        ? `这次请求提前结束了，原因是：${reason}。请再试一次。`
        : '这次请求提前结束了，请再试一次。',
    tooManyToolSteps: '这次任务连续执行了太多步骤，系统已先暂停，避免一直卡住。',
    toolInputInvalid: '这一步没有成功开始，因为缺少必要信息，或者填写内容不正确。',
    defaultQuestionHeader: '请确认',
    nestedRequestsNotSupported: '这一步需要更复杂的连续操作，当前这条新路线还没接好。',
    commandDisabled: '这一步需要运行命令，但你现在没有打开这项权限。',
    approvalUnavailable: '这一步需要你先确认，但当前这条新路线还不能直接发起确认。',
    questionUnavailable: '这一步需要先问你一个问题，但当前还没法把问题发出来。',
    commandRejected: '这一步已取消，因为你没有同意执行它。',
    providerUnsupported: '当前这一步暂时还没准备好，请稍后再试。',
    toolUnavailable: '当前这一步暂时不可用。',
    systemBrowserOnly: '这一步需要用你平时的浏览器来打开，请先在设置里切换浏览器模式。',
    resolvedModelRequired: '当前没有选到可用的模型，请先检查模型设置。',
    upstreamRateLimit: '请求有点太快了，请稍等一下再试。',
    upstreamAuth: '当前账号或密钥暂时不能使用，请检查登录状态或密钥设置。',
    upstreamQuota: '当前账号可用额度不足，暂时无法继续。',
    upstreamUnavailable: '模型服务暂时没有响应，请稍后再试。'
  },
  'zh-TW': {
    noEndpoint: '目前沒有可用的模型連線，請先檢查模型設定。',
    requiresResponses: '目前選擇的模型暫時還不能走這條新路線。',
    outsideScope: '目前選擇的模型還沒加入這一批支援範圍。',
    openAIReady: '目前選擇的模型已經可以走這條新路線。',
    codexReady: '目前選擇的模型已經可以走這條新路線。',
    sharedToolsNotReady: '這條新路線快準備好了，但常用操作還沒有全部接好。',
    scaffoldReadyButInactive: '這條新路線已經準備好了，但你目前選擇的模型還沒切到這裡。',
    unsupportedInputs: ({ unsupportedKinds }) =>
      `這次送出的內容裡有暫時還不支援的類型：${String(unsupportedKinds)}。目前請先只送文字或圖片。`,
    noFinalResponse: '這次請求提早結束了，沒有回傳完整結果。請再試一次。',
    requestFailed: '這次請求沒有順利完成，請稍後再試。',
    incomplete: ({ reason }) =>
      typeof reason === 'string' && reason.trim()
        ? `這次請求提早結束了，原因是：${reason}。請再試一次。`
        : '這次請求提早結束了，請再試一次。',
    tooManyToolSteps: '這次任務連續執行了太多步驟，系統已先暫停，避免一直卡住。',
    toolInputInvalid: '這一步沒有成功開始，因為缺少必要資訊，或填寫內容不正確。',
    defaultQuestionHeader: '請確認',
    nestedRequestsNotSupported: '這一步需要更複雜的連續操作，目前這條新路線還沒接好。',
    commandDisabled: '這一步需要執行命令，但你現在沒有開啟這項權限。',
    approvalUnavailable: '這一步需要你先確認，但目前這條新路線還不能直接發起確認。',
    questionUnavailable: '這一步需要先問你一個問題，但目前還沒法把問題送出來。',
    commandRejected: '這一步已取消，因為你沒有同意執行它。',
    providerUnsupported: '目前這一步暫時還沒準備好，請稍後再試。',
    toolUnavailable: '目前這一步暫時不可用。',
    systemBrowserOnly: '這一步需要用你平常的瀏覽器來開啟，請先在設定裡切換瀏覽器模式。',
    resolvedModelRequired: '目前沒有選到可用的模型，請先檢查模型設定。',
    upstreamRateLimit: '請求有點太快了，請稍等一下再試。',
    upstreamAuth: '目前帳號或金鑰暫時不能使用，請檢查登入狀態或金鑰設定。',
    upstreamQuota: '目前帳號可用額度不足，暫時無法繼續。',
    upstreamUnavailable: '模型服務暫時沒有回應，請稍後再試。'
  },
  en: {
    noEndpoint: 'No model connection is available right now. Please check the model settings.',
    requiresResponses: 'The current model cannot use this new route yet.',
    outsideScope: 'The current model is not in the first supported batch yet.',
    openAIReady: 'The current model is ready to use the new route.',
    codexReady: 'The current model is ready to use the new route.',
    sharedToolsNotReady: 'The new route is almost ready, but common actions are not fully connected yet.',
    scaffoldReadyButInactive: 'The new route is ready, but the current model is still using the existing route.',
    unsupportedInputs: ({ unsupportedKinds }) =>
      `This message includes content that is not supported here yet: ${String(unsupportedKinds)}. For now, please use text or images only.`,
    noFinalResponse: 'This request ended early and did not return a complete result. Please try again.',
    requestFailed: 'This request could not be completed. Please try again.',
    incomplete: ({ reason }) =>
      typeof reason === 'string' && reason.trim()
        ? `This request ended early: ${reason}. Please try again.`
        : 'This request ended early. Please try again.',
    tooManyToolSteps: 'This task ran too many steps in a row, so it was paused to avoid getting stuck.',
    toolInputInvalid: 'This step could not start because some required information was missing or invalid.',
    defaultQuestionHeader: 'Please confirm',
    nestedRequestsNotSupported: 'This step needs a more complex chain of actions, and that is not ready on this route yet.',
    commandDisabled: 'This step needs command access, but command access is turned off.',
    approvalUnavailable: 'This step needs your confirmation first, but this route cannot ask for that confirmation yet.',
    questionUnavailable: 'This step needs to ask you a question first, but that is not ready yet.',
    commandRejected: 'This step was canceled because you did not allow it to run.',
    providerUnsupported: 'This step is not ready yet. Please try again later.',
    toolUnavailable: 'This step is not available right now.',
    systemBrowserOnly: 'This step needs to open in your normal browser. Please change the browser mode in settings first.',
    resolvedModelRequired: 'No usable model was selected. Please check the model settings.',
    upstreamRateLimit: 'Requests are being sent too quickly. Please wait a moment and try again.',
    upstreamAuth: 'The current account or key cannot be used right now. Please check sign-in or key settings.',
    upstreamQuota: 'This account does not have enough available quota right now.',
    upstreamUnavailable: 'The model service is temporarily unavailable. Please try again soon.'
  }
}

export function resolveNativeUserFacingLocale(): NativeUserFacingLocale {
  const envLocale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || ''

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as { app?: { getLocale?: () => string } }
    const locale = electron.app?.getLocale?.() || envLocale
    return normalizeLocale(locale)
  } catch {
    return normalizeLocale(envLocale)
  }
}

function normalizeLocale(locale: string): NativeUserFacingLocale {
  const normalized = locale.trim().toLowerCase()
  if (
    normalized.startsWith('zh-tw')
    || normalized.startsWith('zh-hk')
    || normalized.startsWith('zh-mo')
    || normalized.includes('hant')
  ) {
    return 'zh-TW'
  }

  if (normalized.startsWith('zh')) {
    return 'zh-CN'
  }

  return 'en'
}

export function getNativeUserFacingMessage(
  key: NativeUserFacingMessageKey,
  params: Record<string, unknown> = {}
): string {
  const locale = resolveNativeUserFacingLocale()
  const entry = COPY[locale][key]
  return typeof entry === 'function' ? entry(params) : entry
}

export function describeNativeUpstreamError(params: {
  code?: string
  statusCode?: number
  fallbackMessage?: string
}): string {
  const code = (params.code || '').toLowerCase()

  if (
    code.includes('rate_limit')
    || params.statusCode === 429
  ) {
    return getNativeUserFacingMessage('upstreamRateLimit')
  }

  if (
    code.includes('auth')
    || code.includes('invalid_api_key')
    || code.includes('unauthorized')
    || params.statusCode === 401
    || params.statusCode === 403
  ) {
    return getNativeUserFacingMessage('upstreamAuth')
  }

  if (
    code.includes('quota')
    || code.includes('billing')
    || code.includes('insufficient')
    || params.statusCode === 402
  ) {
    return getNativeUserFacingMessage('upstreamQuota')
  }

  if (params.fallbackMessage && params.fallbackMessage.trim()) {
    return params.fallbackMessage
  }

  return getNativeUserFacingMessage('upstreamUnavailable')
}
