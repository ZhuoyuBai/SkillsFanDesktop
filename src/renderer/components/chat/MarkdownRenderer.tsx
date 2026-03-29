/**
 * MarkdownRenderer - Professional markdown rendering for AI messages
 * Uses react-markdown with GFM support and syntax highlighting
 *
 * Syntax highlighting uses lazy-loaded highlight.js with only common languages
 * bundled initially. Additional languages are loaded on-demand.
 */

import { useState, useCallback, memo, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy, FileText } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { hljs } from '../../lib/highlight-loader'
import { canvasLifecycle } from '../../services/canvas-lifecycle'

interface MarkdownRendererProps {
  content: string
  className?: string
  /** Map of file name → full path for clickable file links in inline code */
  filePathMap?: Record<string, string>
}

// Common file extensions that should be clickable
const CLICKABLE_EXTENSIONS = /\.(csv|xlsx|xls|json|md|txt|html|htm|pdf|png|jpg|jpeg|gif|webp|svg|js|jsx|ts|tsx|py|rb|go|rs|java|c|cpp|swift|kt|php|sh|sql|yaml|yml|xml|css|scss|vue|svelte|log)$/i

// Inline code that may be a clickable file link
function InlineCode({
  children,
  filePathMap,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode; filePathMap?: Record<string, string> }) {
  const text = typeof children === 'string' ? children : ''
  const isFile = text && CLICKABLE_EXTENSIONS.test(text)
  const fullPath = isFile ? (filePathMap?.[text] || filePathMap?.[text.split('/').pop() || '']) : undefined

  if (isFile && fullPath) {
    return (
      <button
        onClick={() => canvasLifecycle.openFile(fullPath, text.split('/').pop())}
        className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[0.9em] font-mono text-primary transition-colors hover:bg-primary/20 cursor-pointer"
        title={fullPath}
        {...props}
      >
        <FileText size={12} className="shrink-0" />
        {children}
      </button>
    )
  }

  return (
    <code
      className="mx-0.5 rounded-md bg-secondary/70 px-1.5 py-0.5 text-[0.9em] font-mono text-foreground"
      {...props}
    >
      {children}
    </code>
  )
}

// Code block with copy button
function CodeBlock({
  children,
  className,
  filePathMap,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode; filePathMap?: Record<string, string> }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)

  // Extract language from className (format: language-xxx)
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''

  const handleCopy = useCallback(async () => {
    // Read text from the actual rendered DOM element
    // This correctly handles rehype-highlight's <span> elements
    const text = codeRef.current?.textContent || ''
    await navigator.clipboard.writeText(text.replace(/\n$/, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // No language class: distinguish inline code from no-language fenced blocks
  if (!className) {
    const text = typeof children === 'string' ? children : String(children || '')
    if (text.includes('\n')) {
      // Multi-line = fenced code block without language tag → system font
      return (
        <div className="group relative my-4 overflow-hidden rounded-xl border border-border/40 bg-card/30">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground/60
                hover:text-foreground bg-background/60 backdrop-blur-sm border border-border/50
                rounded-md transition-all"
              title={t('Copy code')}
            >
              {copied ? (
                <>
                  <Check size={14} className="text-green-400" />
                  <span className="text-green-400">{t('Copied')}</span>
                </>
              ) : (
                <>
                  <Copy size={14} />
                  <span>{t('Copy')}</span>
                </>
              )}
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-4 text-[14px] leading-7" style={{ fontFamily: 'inherit' }}>
            <code ref={codeRef} {...props}>{children}</code>
          </pre>
        </div>
      )
    }
    // Single-line = true inline code
    return <InlineCode filePathMap={filePathMap} {...props}>{children}</InlineCode>
  }

  // Code block — Style D: left gradient accent bar + compact header
  return (
    <div className="group relative my-4 flex overflow-hidden rounded-xl border border-border/40 bg-card/50">
      {/* Left gradient accent bar */}
      <div className="w-1 shrink-0 bg-gradient-to-b from-orange-500 to-red-500" />
      <div className="flex-1 min-w-0">
        {/* Compact header */}
        <div className="flex items-center justify-between border-b border-border/20 px-3.5 py-2">
          <span className="text-xs font-mono font-medium uppercase tracking-[0.14em] text-orange-400/90">
            {language}
          </span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground/60
              hover:text-foreground hover:bg-white/5 [.light_&]:hover:bg-black/5 rounded-md transition-all"
            title={t('Copy code')}
          >
            {copied ? (
              <>
                <Check size={14} className="text-green-400" />
                <span className="text-green-400">{t('Copied')}</span>
              </>
            ) : (
              <>
                <Copy size={14} />
                <span className="opacity-0 group-hover:opacity-100 transition-opacity">{t('Copy')}</span>
              </>
            )}
          </button>
        </div>

        {/* Code content */}
        <pre className="overflow-x-auto px-4 py-4">
          <code ref={codeRef} className={`${className} text-[13.5px] font-mono leading-7`} {...props}>
            {children}
          </code>
        </pre>
      </div>
    </div>
  )
}

// Build markdown components with optional file path context
function buildComponents(filePathMap?: Record<string, string>) {
  return {
  // Code blocks and inline code
  code: (props: any) => <CodeBlock {...props} filePathMap={filePathMap} />,

  // Paragraphs
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-4 last:mb-0 leading-7 text-foreground/92">{children}</p>
  ),

  // Headings
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-3 mt-6 text-[1.35rem] font-semibold leading-tight tracking-[-0.015em] text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-3 mt-5 text-[1.12rem] font-semibold leading-snug text-foreground first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-2 mt-4 text-[1rem] font-semibold leading-snug text-foreground/95 first:mt-0">{children}</h3>
  ),

  // Lists
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-4 list-disc space-y-2 pl-6 marker:text-muted-foreground/55">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-4 list-decimal space-y-2 pl-6 marker:text-muted-foreground/55">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-7 text-foreground/90">{children}</li>
  ),

  // Blockquote
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-4 rounded-r-xl border-l-[3px] border-orange-500/60 bg-orange-500/[0.07] px-4 py-3.5 text-foreground/90">
      {children}
    </blockquote>
  ),

  // Links
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-link underline decoration-link/30 underline-offset-4 transition-colors hover:decoration-link"
    >
      {children}
    </a>
  ),

  // Tables
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-border/40 bg-card/20">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-secondary/50">{children}</thead>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-2 text-left font-medium border-b border-border/50">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-2 border-b border-border/30">{children}</td>
  ),

  // Horizontal rule
  hr: () => <hr className="my-6 border-border/50" />,

  // Strong and emphasis
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),

  // Strikethrough
  del: ({ children }: { children?: React.ReactNode }) => (
    <del className="text-muted-foreground line-through">{children}</del>
  ),

  // Task list items (GFM)
  input: ({ checked, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      className="mr-2 rounded border-muted-foreground/30 text-primary focus:ring-primary/30"
      {...props}
    />
  ),
}}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className = '',
  filePathMap
}: MarkdownRendererProps) {
  // Configure rehype-highlight to use our lazy-loaded hljs instance
  // This ensures we use the same instance with pre-registered common languages
  const rehypeHighlightOptions = useMemo(() => [[rehypeHighlight, { hljs }]], [])
  const components = useMemo(() => buildComponents(filePathMap), [filePathMap])

  if (!content) return null

  return (
    <div className={`markdown-content text-[15px] leading-7 text-foreground/92 ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypeHighlightOptions}
        components={components as any}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
