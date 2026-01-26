/**
 * PKCE (Proof Key for Code Exchange) Utilities
 *
 * Implements RFC 7636 for secure OAuth 2.0 authorization code flow.
 * Prevents authorization code interception attacks.
 */

import crypto from 'crypto'

/**
 * Generate PKCE code_verifier
 *
 * RFC 7636 requirements:
 * - Length: 43-128 characters
 * - Characters: [A-Z] [a-z] [0-9] -._~
 *
 * @returns Base64URL encoded random string (43 characters)
 */
export function generateCodeVerifier(): string {
  // 32 bytes of random data -> 43 characters when Base64URL encoded
  const buffer = crypto.randomBytes(32)
  return base64URLEncode(buffer)
}

/**
 * Generate PKCE code_challenge from code_verifier
 *
 * Uses SHA256 hash (S256 method) as required by RFC 7636
 *
 * @param verifier The code_verifier to hash
 * @returns Base64URL encoded SHA256 hash
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest()
  return base64URLEncode(hash)
}

/**
 * Base64URL encode (RFC 4648)
 *
 * Differences from standard Base64:
 * - '+' -> '-'
 * - '/' -> '_'
 * - Remove trailing '='
 *
 * @param buffer Buffer to encode
 * @returns Base64URL encoded string
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}
