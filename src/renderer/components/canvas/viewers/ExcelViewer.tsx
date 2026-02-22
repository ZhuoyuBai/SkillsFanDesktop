/**
 * Excel Viewer - Table display for .xlsx/.xls files
 *
 * Features:
 * - Table view with headers
 * - Multi-sheet tab switching
 * - Horizontal and vertical scrolling
 * - Row/column count
 * - Copy to clipboard (as CSV)
 * - Open with external application
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Copy, Check, ExternalLink, Table, Code2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { api } from '../../../api'
import type { CanvasTab } from '../../../stores/canvas.store'
import { useTranslation } from '../../../i18n'
import { cn } from '../../../lib/utils'

interface ExcelViewerProps {
  tab: CanvasTab
  onScrollChange?: (position: number) => void
}

export function ExcelViewer({ tab, onScrollChange }: ExcelViewerProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'source'>('table')
  const [activeSheetIndex, setActiveSheetIndex] = useState(0)

  // Parse Excel from base64 content
  const workbook = useMemo(() => {
    if (!tab.content) return null
    try {
      const binaryStr = atob(tab.content)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      return XLSX.read(bytes, { type: 'array' })
    } catch (err) {
      console.error('[ExcelViewer] Failed to parse:', err)
      return null
    }
  }, [tab.content])

  const sheetNames = workbook?.SheetNames || []
  const activeSheetName = sheetNames[activeSheetIndex] || ''

  // Parse current sheet data
  const { headers, dataRows, columnCount, csvText } = useMemo(() => {
    if (!workbook || !activeSheetName) {
      return { headers: [] as string[], dataRows: [] as string[][], columnCount: 0, csvText: '' }
    }
    const sheet = workbook.Sheets[activeSheetName]
    const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })

    if (jsonData.length === 0) {
      return { headers: [] as string[], dataRows: [] as string[][], columnCount: 0, csvText: '' }
    }

    const headers = (jsonData[0] || []).map(String)
    const dataRows = jsonData.slice(1).map(row => row.map(String))
    const maxCols = Math.max(...jsonData.map(row => row.length))
    const csvText = XLSX.utils.sheet_to_csv(sheet)

    return { headers, dataRows, columnCount: maxCols, csvText }
  }, [workbook, activeSheetName])

  // Restore scroll position
  useEffect(() => {
    if (containerRef.current && tab.scrollPosition !== undefined) {
      containerRef.current.scrollTop = tab.scrollPosition
    }
  }, [tab.id])

  const handleScroll = useCallback(() => {
    if (containerRef.current && onScrollChange) {
      onScrollChange(containerRef.current.scrollTop)
    }
  }, [onScrollChange])

  const handleCopy = async () => {
    if (!csvText) return
    try {
      await navigator.clipboard.writeText(csvText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleOpenExternal = async () => {
    if (!tab.path) return
    try {
      await api.openArtifact(tab.path)
    } catch (err) {
      console.error('Failed to open with external app:', err)
    }
  }

  const canOpenExternal = !api.isRemoteMode() && tab.path

  if (!workbook) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>{t('Failed to load file')}</p>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col h-full bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">Excel</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{t('{{count}} rows', { count: dataRows.length })}</span>
          <span className="text-muted-foreground/50">×</span>
          <span>{t('{{count}} columns', { count: columnCount })}</span>
          {sheetNames.length > 1 && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span>{t('{{count}} sheets', { count: sheetNames.length })}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <div className="flex items-center bg-secondary/50 rounded-md p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'table'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('Table view')}
            >
              <Table className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('source')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'source'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('Source view')}
            >
              <Code2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
            title={t('Copy')}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {canOpenExternal && (
            <button
              onClick={handleOpenExternal}
              className="p-1.5 rounded hover:bg-secondary transition-colors"
              title={t('Open in external application')}
            >
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Sheet tabs */}
      {sheetNames.length > 1 && (
        <div className="flex items-center gap-0 px-2 border-b border-border bg-card/30 overflow-x-auto">
          {sheetNames.map((name, i) => (
            <button
              key={name}
              onClick={() => setActiveSheetIndex(i)}
              className={cn(
                'px-3 py-1.5 text-xs whitespace-nowrap border-b-2 transition-colors',
                i === activeSheetIndex
                  ? 'border-primary text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto"
      >
        {viewMode === 'table' ? (
          <TableView headers={headers} dataRows={dataRows} columnCount={columnCount} />
        ) : (
          <SourceView content={csvText} />
        )}
      </div>
    </div>
  )
}

function TableView({
  headers,
  dataRows,
  columnCount
}: {
  headers: string[]
  dataRows: string[][]
  columnCount: number
}) {
  const { t } = useTranslation()
  if (headers.length === 0 && dataRows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>{t('Empty file')}</p>
      </div>
    )
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10">
        <tr className="bg-secondary/80 backdrop-blur-sm">
          <th className="w-12 px-3 py-2 text-left text-xs font-medium text-muted-foreground border-b border-r border-border">
            #
          </th>
          {Array.from({ length: columnCount }, (_, i) => (
            <th
              key={i}
              className="px-3 py-2 text-left text-xs font-medium text-foreground border-b border-r border-border whitespace-nowrap"
            >
              {headers[i] || t('Column {{index}}', { index: i + 1 })}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {dataRows.map((row, rowIndex) => (
          <tr
            key={rowIndex}
            className="hover:bg-secondary/30 transition-colors"
          >
            <td className="w-12 px-3 py-1.5 text-xs text-muted-foreground/60 border-b border-r border-border/50 bg-background/50">
              {rowIndex + 1}
            </td>
            {Array.from({ length: columnCount }, (_, colIndex) => (
              <td
                key={colIndex}
                className="px-3 py-1.5 border-b border-r border-border/50 whitespace-nowrap max-w-[300px] overflow-hidden text-ellipsis"
                title={row[colIndex] || ''}
              >
                {row[colIndex] || ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SourceView({ content }: { content: string }) {
  const lines = content.split('\n')

  return (
    <div className="flex min-h-full font-mono text-sm">
      <div className="sticky left-0 flex-shrink-0 select-none bg-background/80 backdrop-blur-sm border-r border-border/50 text-right text-muted-foreground/40 pr-3 pl-4 py-4 leading-6">
        {lines.map((_, i) => (
          <div key={i + 1}>{i + 1}</div>
        ))}
      </div>
      <pre className="flex-1 py-4 pl-4 pr-4 overflow-x-auto m-0">
        <code className="text-foreground leading-6 block">
          {lines.map((line, i) => (
            <div key={i}>{line || ' '}</div>
          ))}
        </code>
      </pre>
    </div>
  )
}
