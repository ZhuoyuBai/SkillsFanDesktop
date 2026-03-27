import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const nodePtyDir = path.resolve(__dirname, '../node_modules/node-pty/prebuilds')

function ensureExecutable(filePath) {
  if (!fs.existsSync(filePath)) {
    return false
  }

  const stat = fs.statSync(filePath)
  const mode = stat.mode & 0o777
  if ((mode & 0o111) !== 0o111) {
    fs.chmodSync(filePath, 0o755)
    console.log(`[fix-node-pty] chmod 755 ${filePath}`)
  }

  return true
}

function main() {
  if (!fs.existsSync(nodePtyDir)) {
    console.log('[fix-node-pty] node-pty prebuilds directory not found, skipping')
    return
  }

  const targets = fs
    .readdirSync(nodePtyDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(nodePtyDir, entry.name, 'spawn-helper'))

  let repaired = 0
  for (const target of targets) {
    if (ensureExecutable(target)) {
      repaired += 1
    }
  }

  console.log(`[fix-node-pty] checked ${targets.length} helper(s), available ${repaired}`)
}

main()
