/**
 * AttachmentPreview - Horizontal card style attachment preview
 *
 * Layout per card: [thumbnail/icon] [name + size] [x]
 */

import { X, FileText, FileCode, Table, Loader2 } from 'lucide-react'
import type { Attachment, TextAttachment } from '../../types'
import { formatFileSize } from '../../utils/imageProcessor'
import { MessageImages } from './ImageAttachmentPreview'

interface AttachmentPreviewProps {
  attachments: Attachment[]
  onRemove: (id: string) => void
  isProcessing?: boolean
}

export function AttachmentPreview({ attachments, onRemove, isProcessing }: AttachmentPreviewProps) {
  if (attachments.length === 0 && !isProcessing) return null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-1 py-1.5">
      {attachments.map(att => (
        <AttachmentCard key={att.id} attachment={att} onRemove={() => onRemove(att.id)} />
      ))}
      {isProcessing && (
        <div className="flex items-center justify-center h-14 rounded-xl
                        border border-dashed border-border bg-muted/30">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

interface MessageAttachmentsProps {
  attachments: Attachment[]
}

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  if (attachments.length === 0) return null

  const imageAttachments = attachments.filter(
    (attachment): attachment is Extract<Attachment, { type: 'image' }> => attachment.type === 'image'
  )
  const hasOnlyImages = imageAttachments.length === attachments.length

  if (hasOnlyImages) {
    return <MessageImages images={imageAttachments} />
  }

  return (
    <div className="mb-3 grid gap-2">
      {attachments.map((attachment) => (
        <MessageAttachmentCard key={attachment.id} attachment={attachment} />
      ))}
    </div>
  )
}

function AttachmentCard({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  return (
    <div className="group flex items-center gap-2.5 pl-1.5 pr-2 py-1.5 rounded-xl
                    border border-border bg-muted/30 hover:border-border/80
                    transition-colors min-w-0">
      {/* Thumbnail / Icon */}
      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-muted/50">
        {attachment.type === 'image' ? (
          <img
            src={`data:${attachment.mediaType};base64,${attachment.data}`}
            className="w-full h-full object-cover"
            alt={attachment.name || 'image'}
          />
        ) : (
          <FileIcon attachment={attachment} />
        )}
      </div>

      {/* Name + Size */}
      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-sm text-foreground truncate leading-tight max-w-full">
          {attachment.name || 'file'}
        </span>
        <span className="text-xs text-muted-foreground/60 leading-tight">
          {formatFileSize(attachment.size || 0)}
        </span>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="w-5 h-5 rounded-full bg-muted flex items-center justify-center shrink-0
                   text-muted-foreground/40 hover:text-foreground hover:bg-muted-foreground/20
                   transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  )
}

function MessageAttachmentCard({ attachment }: { attachment: Attachment }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/15 bg-black/5 min-w-0">
      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-white/70 dark:bg-white/5">
        {attachment.type === 'image' ? (
          <img
            src={`data:${attachment.mediaType};base64,${attachment.data}`}
            className="w-full h-full object-cover"
            alt={attachment.name || 'image'}
          />
        ) : (
          <FileIcon attachment={attachment} />
        )}
      </div>

      <div className="flex flex-col items-start min-w-0 flex-1">
        <span className="text-sm truncate leading-tight max-w-full">
          {attachment.name || 'file'}
        </span>
        <span className="text-xs text-muted-foreground/70 leading-tight">
          {formatFileSize(attachment.size || 0)}
        </span>
      </div>
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
