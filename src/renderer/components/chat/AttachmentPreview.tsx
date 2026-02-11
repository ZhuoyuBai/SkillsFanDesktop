/**
 * AttachmentPreview - Universal attachment preview cards
 *
 * Displays image thumbnails, PDF icons, code file icons, etc.
 * Each card shows file type icon, filename, size, and a remove button.
 */

import { X, FileText, FileCode, Table, Loader2 } from 'lucide-react'
import type { Attachment, TextAttachment } from '../../types'
import { formatFileSize } from '../../utils/imageProcessor'
import { useTranslation } from '../../i18n'

interface AttachmentPreviewProps {
  attachments: Attachment[]
  onRemove: (id: string) => void
  isProcessing?: boolean
}

export function AttachmentPreview({ attachments, onRemove, isProcessing }: AttachmentPreviewProps) {
  const { t } = useTranslation()

  if (attachments.length === 0 && !isProcessing) return null

  return (
    <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-border/30">
      {attachments.map(att => (
        <AttachmentCard key={att.id} attachment={att} onRemove={() => onRemove(att.id)} />
      ))}
      {isProcessing && (
        <div className="flex items-center justify-center w-24 h-[72px] rounded-lg
                        border border-dashed border-border bg-muted/30 shrink-0">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

function AttachmentCard({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  return (
    <div className="relative group shrink-0 w-24 h-[72px] rounded-lg border border-border
                    bg-muted/30 overflow-hidden flex flex-col items-center justify-center gap-0.5
                    hover:border-border/80 transition-colors">
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 w-4 h-4 rounded-full bg-background/90 border border-border/50
                   flex items-center justify-center opacity-0 group-hover:opacity-100
                   transition-opacity hover:bg-destructive/10 hover:border-destructive/30"
      >
        <X size={10} />
      </button>

      {/* Icon / Thumbnail */}
      {attachment.type === 'image' ? (
        <img
          src={`data:${attachment.mediaType};base64,${attachment.data}`}
          className="w-full h-10 object-cover rounded-t-lg"
          alt={attachment.name || 'image'}
        />
      ) : (
        <div className="pt-1">
          <FileIcon attachment={attachment} />
        </div>
      )}

      {/* Filename */}
      <span className="text-[10px] text-muted-foreground truncate w-full px-1.5 text-center leading-tight">
        {attachment.name || 'file'}
      </span>

      {/* File size */}
      <span className="text-[9px] text-muted-foreground/50 leading-tight">
        {formatFileSize(attachment.size || 0)}
      </span>
    </div>
  )
}

function FileIcon({ attachment }: { attachment: Attachment }) {
  switch (attachment.type) {
    case 'pdf':
      return <FileText size={20} className="text-red-400" />
    case 'text': {
      const ta = attachment as TextAttachment
      if (ta.language) return <FileCode size={20} className="text-blue-400" />
      if (ta.name?.endsWith('.csv') || ta.name?.endsWith('.tsv') || ta.name?.endsWith('.json'))
        return <Table size={20} className="text-green-400" />
      return <FileText size={20} className="text-muted-foreground" />
    }
    default:
      return <FileText size={20} className="text-muted-foreground" />
  }
}
