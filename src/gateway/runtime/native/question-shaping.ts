import { resolveNativeUserFacingLocale } from './user-facing'

interface NativeQuestionOptionInput {
  label?: unknown
  description?: unknown
}

export interface NativeQuestionInput {
  question?: unknown
  header?: unknown
  options?: unknown
  multiSelect?: unknown
}

export interface NormalizedNativeQuestion {
  question: string
  header: string
  options: Array<{ label: string; description: string }>
  multiSelect: boolean
}

type QuestionTopic =
  | 'project'
  | 'folder'
  | 'url'
  | 'tab'
  | 'file'
  | 'terminal'
  | 'model'
  | 'generic'

const TECHNICAL_WORD_RE =
  /parameter|argument|payload|schema|json|field|endpoint|runtime|provider|selector|conversation|sessionindex|paneindex|windowindex|tabindex|required|missing|input\b|target\b|变量|参数|字段|接口|端点|运行时|提供方|会话索引|分栏索引|窗口索引|标签索引|缺少|必填/i

const PREFIX_RE =
  /^(follow[- ]?up|clarification|question|need(?:s)? clarification|missing(?: required)?(?: information| input| parameter| field)?|please\s+(?:provide|select|choose|confirm|clarify)|select|choose|confirm|provide|ask(?: the user)?|问题|追问|补充信息|需要确认|请(?:提供|选择|确认|补充|说明))[:：\-\s]*/i

const TOPIC_PATTERNS: Array<{ topic: QuestionTopic; pattern: RegExp }> = [
  { topic: 'project', pattern: /project|repo|repository|workspace|working directory|project directory|项目|仓库|工作区/i },
  { topic: 'folder', pattern: /folder|directory|path|文件夹|目录|路径/i },
  { topic: 'url', pattern: /url|uri|link|website|web page|网页|网址|链接/i },
  { topic: 'tab', pattern: /\btab\b|page|页面|标签页/i },
  { topic: 'file', pattern: /file|document|pdf|image|文件|文档|图片/i },
  { topic: 'terminal', pattern: /terminal|shell|command|session|pane|window|终端|命令行|会话|分栏/i },
  { topic: 'model', pattern: /model|provider|模型|引擎/i }
]

const TOPIC_COPY: Record<
  ReturnType<typeof resolveNativeUserFacingLocale>,
  Record<QuestionTopic, string>
> = {
  'zh-CN': {
    project: '你想继续处理哪一个项目？',
    folder: '你想在哪个文件夹里继续？',
    url: '你想打开哪一个网页？',
    tab: '你想操作哪一个页面？',
    file: '你想使用哪一个文件？',
    terminal: '你想使用哪一个终端窗口？',
    model: '你想使用哪一个模型？',
    generic: '请补充一下你希望我继续处理的内容。'
  },
  'zh-TW': {
    project: '你想繼續處理哪一個專案？',
    folder: '你想在哪個資料夾裡繼續？',
    url: '你想打開哪一個網頁？',
    tab: '你想操作哪一個頁面？',
    file: '你想使用哪一個檔案？',
    terminal: '你想使用哪一個終端視窗？',
    model: '你想使用哪一個模型？',
    generic: '請補充一下你希望我繼續處理的內容。'
  },
  en: {
    project: 'Which project should I continue with?',
    folder: 'Which folder should I continue in?',
    url: 'Which web page should I open?',
    tab: 'Which page should I work on?',
    file: 'Which file should I use?',
    terminal: 'Which terminal window should I use?',
    model: 'Which model should I use?',
    generic: 'Please tell me what you want me to continue with.'
  }
}

const HEADER_COPY: Record<
  ReturnType<typeof resolveNativeUserFacingLocale>,
  { choose: string; confirm: string }
> = {
  'zh-CN': {
    choose: '请选择',
    confirm: '请确认'
  },
  'zh-TW': {
    choose: '請選擇',
    confirm: '請確認'
  },
  en: {
    choose: 'Choose one',
    confirm: 'Please confirm'
  }
}

function trimText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function simplifyQuestionText(question: string): string {
  return question
    .replace(PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferTopic(question: string, options: Array<{ label: string; description: string }>): QuestionTopic {
  const haystack = [
    question,
    ...options.map((option) => `${option.label} ${option.description}`)
  ].join(' ')

  for (const candidate of TOPIC_PATTERNS) {
    if (candidate.pattern.test(haystack)) {
      return candidate.topic
    }
  }

  return 'generic'
}

function looksTooTechnical(question: string): boolean {
  return (
    question.length > 120
    || TECHNICAL_WORD_RE.test(question)
    || /[`{}[\]<>]/.test(question)
  )
}

function normalizeOptions(options: unknown): Array<{ label: string; description: string }> {
  const rawOptions = Array.isArray(options) ? options.slice(0, 4) : []

  return rawOptions
    .filter((item): item is NativeQuestionOptionInput => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      label: trimText(item.label, 120),
      description: trimText(item.description, 160)
    }))
    .filter((item) => item.label.length > 0)
}

function normalizeHeader(
  header: unknown,
  hasOptions: boolean
): string {
  const locale = resolveNativeUserFacingLocale()
  const cleaned = trimText(header, 32)
  if (cleaned) {
    return cleaned
  }

  return hasOptions
    ? HEADER_COPY[locale].choose
    : HEADER_COPY[locale].confirm
}

export function normalizeNativeQuestionInput(
  input: NativeQuestionInput
): NormalizedNativeQuestion | null {
  const locale = resolveNativeUserFacingLocale()
  const options = normalizeOptions(input.options)
  const cleanedQuestion = simplifyQuestionText(trimText(input.question, 240))
  const topic = inferTopic(cleanedQuestion, options)

  const question = cleanedQuestion && !looksTooTechnical(cleanedQuestion)
    ? cleanedQuestion
    : TOPIC_COPY[locale][options.length > 0 ? topic : 'generic']

  if (!question) {
    return null
  }

  return {
    question,
    header: normalizeHeader(input.header, options.length > 0),
    options,
    multiSelect: false
  }
}
