/**
 * Secure Storage Service
 *
 * @deprecated No longer used for new data - we store API keys directly in config.json
 * Kept for backward compatibility during migration from encrypted to plaintext storage
 *
 * Uses Electron's safeStorage API to encrypt sensitive data like tokens.
 * - macOS: Uses Keychain
 * - Windows: Uses DPAPI
 * - Linux: Uses libsecret
 *
 * Falls back to plaintext if encryption is not available.
 */

import { safeStorage } from 'electron'

// Prefix to identify encrypted strings
const ENCRYPTED_PREFIX = 'enc:'

/**
 * Check if encryption is available on this platform
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

/**
 * Encrypt a string value
 * Returns encrypted base64 string with prefix, or original value if encryption unavailable
 */
export function encryptString(value: string): string {
  if (!value) return value

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[SecureStorage] Encryption not available, storing plaintext')
    return value
  }

  try {
    const encrypted = safeStorage.encryptString(value)
    return ENCRYPTED_PREFIX + encrypted.toString('base64')
  } catch (error) {
    console.error('[SecureStorage] Encryption failed:', error)
    return value
  }
}

/**
 * Decrypt a string value
 * Handles both encrypted (with prefix) and plaintext values
 */
export function decryptString(value: string): string {
  if (!value) return value

  // Check if it's an encrypted value
  if (!value.startsWith(ENCRYPTED_PREFIX)) {
    // Plaintext or legacy value - return as-is
    return value
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[SecureStorage] Encryption not available, cannot decrypt')
    return ''
  }

  try {
    const base64Data = value.slice(ENCRYPTED_PREFIX.length)
    const buffer = Buffer.from(base64Data, 'base64')
    return safeStorage.decryptString(buffer)
  } catch (error) {
    console.error('[SecureStorage] Decryption failed:', error)
    return ''
  }
}

/**
 * Encrypt token fields in an object
 * Encrypts: accessToken, refreshToken
 */
export function encryptTokens<T extends Record<string, any>>(obj: T): T {
  if (!obj) return obj

  const result = { ...obj }

  if (result.accessToken && typeof result.accessToken === 'string') {
    result.accessToken = encryptString(result.accessToken)
  }

  if (result.refreshToken && typeof result.refreshToken === 'string') {
    result.refreshToken = encryptString(result.refreshToken)
  }

  return result
}

/**
 * Decrypt token fields in an object
 * Decrypts: accessToken, refreshToken
 */
export function decryptTokens<T extends Record<string, any>>(obj: T): T {
  if (!obj) return obj

  const result = { ...obj }

  if (result.accessToken && typeof result.accessToken === 'string') {
    result.accessToken = decryptString(result.accessToken)
  }

  if (result.refreshToken && typeof result.refreshToken === 'string') {
    result.refreshToken = decryptString(result.refreshToken)
  }

  return result
}
