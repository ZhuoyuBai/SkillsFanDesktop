/**
 * Utilities for turning iLink QR code image payloads into renderable image URLs.
 *
 * The API response format is inconsistent in practice, so we normalize any inline
 * image payload we recognize and otherwise generate a local QR image from the
 * returned qrcode string.
 */

function normalizeBase64(value: string): string {
  const compact = value.replace(/\s+/g, '')
  return compact.replace(/-/g, '+').replace(/_/g, '/')
}

function looksLikeBase64(value: string): boolean {
  return value.length >= 64 && /^[A-Za-z0-9+/=_-]+$/.test(value)
}

export function normalizeInlineQRCodeImage(value?: string): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) {
    return undefined
  }

  if (trimmed.startsWith('data:image/')) {
    return trimmed
  }

  if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`
  }

  const normalizedBase64 = normalizeBase64(trimmed)
  if (looksLikeBase64(normalizedBase64)) {
    return `data:image/png;base64,${normalizedBase64}`
  }

  return undefined
}

async function generateQRCodeDataUrl(qrcode: string): Promise<string> {
  const QRCode = await import('qrcode')
  return QRCode.toDataURL(qrcode, {
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  })
}

function looksLikeUrl(value?: string): boolean {
  if (!value) return false
  const trimmed = value.trim()
  return trimmed.startsWith('http://') || trimmed.startsWith('https://')
}

export async function resolveQRCodeImageSource(
  qrcode: string,
  qrcodeImageContent?: string,
  scannableUrl?: string,
  generateDataUrl: (value: string) => Promise<string> = generateQRCodeDataUrl
): Promise<string> {
  // 1. Prefer API-provided inline image (base64, data URL, SVG)
  const normalized = normalizeInlineQRCodeImage(qrcodeImageContent)
  if (normalized) {
    return normalized
  }

  // 2. qrcode_img_content might be a scannable URL (not an image), generate QR from it
  if (looksLikeUrl(qrcodeImageContent)) {
    console.log('[QRCode] qrcode_img_content is a URL, generating QR from it')
    return generateDataUrl(qrcodeImageContent!.trim())
  }

  // 3. Use an explicit scannable URL if provided
  if (scannableUrl) {
    console.log('[QRCode] Generating QR from scannable URL:', scannableUrl)
    return generateDataUrl(scannableUrl)
  }

  // 4. Fallback: encode the raw qrcode identifier (may not be scannable by WeChat)
  console.warn('[QRCode] No scannable URL available, falling back to raw qrcode identifier')
  return generateDataUrl(qrcode)
}
