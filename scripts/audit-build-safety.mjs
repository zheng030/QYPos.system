import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const distDir = path.join(rootDir, 'dist')

if (!fs.existsSync(distDir)) {
  console.error('dist directory not found. Run `npm run build` before audit:build-safety.')
  process.exit(1)
}

const forbiddenMarkers = [
  '開發模式：登入驗證已略過',
  'auth-gate.impl.dev',
  'verifyOwnerPasswordChange(){return true',
  'verifyEmployeePasswordChange(){return true',
  'verifyPosLogin(){return true',
  'verifyOwnerLogin(){return true',
  'verifyEmployeeLogin(){return true',
]

const files = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    files.push(fullPath)
  }
}

walk(distDir)

const failures = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  for (const marker of forbiddenMarkers) {
    if (content.includes(marker)) {
      failures.push(`${path.relative(rootDir, file)} contains forbidden marker: ${marker}`)
    }
  }
}

if (failures.length > 0) {
  console.error('[Build safety audit failed]')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log('Build safety audit passed.')
