import { ipcHandle } from './utils'
import {
  readTerminalClipboardPaste,
  saveTerminalImage,
} from '../services/terminal-image.service'

export function registerTerminalImageHandlers(): void {
  ipcHandle('terminal-image:read-clipboard', (_event, terminalId: string) => {
    return readTerminalClipboardPaste(terminalId)
  })

  ipcHandle('terminal-image:save', (_event, request: {
    terminalId: string
    base64Data: string
    mediaType?: string
    name?: string
  }) => {
    return saveTerminalImage(request)
  })
}
