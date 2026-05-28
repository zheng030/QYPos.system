import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const targetFiles = [
  'src/app/app-shell.ts',
  'src/app/bootstrap.ts',
  'src/app/feature-registry.ts',
  'src/features/checkin/app.ts',
  'src/features/checkin/handlers.ts',
  'src/features/pos-admin/owner-finance.ts',
  'src/features/pos-admin/product-management.ts',
  'src/features/pos-reporting/history-reporting.ts',
  'src/features/pos-sales/menu-modals.ts',
  'src/features/pos-sales/workspace-ui.ts',
  'src/features/pos-shell/runtime.ts',
  'src/app/app-context.ts',
]

const errors = []

function readFile(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), 'utf8')
}

function stripStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/`(?:\\.|[^`])*`/g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/"(?:\\.|[^"])*"/g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/'(?:\\.|[^'])*'/g, (match) => match.replace(/[^\n]/g, ' '))
}

function collectImports(source) {
  const imported = new Set()
  for (const match of source.matchAll(/import\s+(.*?)\s+from\s+/gs)) {
    const clause = match[1].trim()
    if (!clause) {
      continue
    }
    if (clause.startsWith('{')) {
      for (const item of clause.slice(1, -1).split(',')) {
        const name = item
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim()
        if (name) {
          imported.add(name)
        }
      }
      continue
    }
    if (clause.includes('{')) {
      const [defaultImport, namedImports] = clause.split(',', 2)
      if (defaultImport.trim()) {
        imported.add(defaultImport.trim())
      }
      if (namedImports) {
        for (const item of namedImports.trim().slice(1, -1).split(',')) {
          const name = item
            .trim()
            .split(/\s+as\s+/)[0]
            ?.trim()
          if (name) {
            imported.add(name)
          }
        }
      }
      continue
    }
    imported.add(clause)
  }
  return imported
}

function collectDeclaredNames(source) {
  const declared = collectImports(source)

  for (const match of source.matchAll(/\b(?:let|const|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    declared.add(match[1])
  }

  for (const match of source.matchAll(/\basync\s+function\s+([A-Za-z_$][\w$]*)/g)) {
    declared.add(match[1])
  }

  for (const match of source.matchAll(/\b(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g)) {
    for (const param of match[1].split(',')) {
      const name = param.trim().replace(/=.*$/, '')
      if (name) {
        declared.add(name)
      }
    }
  }

  return declared
}

function getLineNumber(source, index) {
  return source.slice(0, index).split('\n').length
}

function auditUndeclaredAssignments(filePath, source, declared) {
  const stripped = stripStrings(source)
  for (const match of stripped.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*=\s*(?!=)/gm)) {
    const name = match[1]
    if (declared.has(name)) {
      continue
    }
    errors.push({
      filePath,
      line: getLineNumber(source, match.index),
      rule: 'undeclared-assignment',
      detail: name,
    })
  }
}

function auditExpressionScope(filePath, source, declared) {
  const fnStart = source.indexOf('function createExpressionScope()')
  if (fnStart === -1) {
    return
  }

  const returnStart = source.indexOf('return {', fnStart)
  if (returnStart === -1) {
    return
  }

  const bodyStart = source.indexOf('{', returnStart)
  if (bodyStart === -1) {
    return
  }

  let depth = 0
  let bodyEnd = -1
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        bodyEnd = index
        break
      }
    }
  }

  if (bodyEnd === -1) {
    return
  }

  const objectBody = source.slice(bodyStart + 1, bodyEnd)
  for (const match of objectBody.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*,/gm)) {
    const name = match[1]
    if (declared.has(name)) {
      continue
    }
    errors.push({
      filePath,
      line: getLineNumber(source, bodyStart + 1 + match.index),
      rule: 'missing-expression-binding',
      detail: name,
    })
  }
}

function auditTopLevelCorePosApi(filePath, source) {
  const stripped = stripStrings(source)
  for (const match of stripped.matchAll(/^\s*(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*getCorePosApi\(\)/gm)) {
    errors.push({
      filePath,
      line: getLineNumber(source, match.index),
      rule: 'top-level-core-pos-api',
      detail: 'getCorePosApi() must be resolved inside boot/init',
    })
  }
}

function auditForbiddenPatterns(filePath, source) {
  const forbiddenPatterns = [
    { pattern: '@ts-nocheck', rule: 'ts-nocheck', detail: 'Remove @ts-nocheck from active runtime files' },
    { pattern: 'core-pos-api', rule: 'legacy-core-pos-api', detail: 'Legacy core-pos-api bridge must stay removed' },
    {
      pattern: 'registerExpressionScope',
      rule: 'expression-scope-registration',
      detail: 'Expression scope registration must stay removed',
    },
    {
      pattern: 'new Function',
      rule: 'dynamic-function-construction',
      detail: 'Dynamic function construction must stay removed from runtime',
    },
    {
      pattern: 'features/flavor/app.js',
      rule: 'legacy-flavor-runtime',
      detail: 'Flavor must be integrated into current TS runtime',
    },
  ]

  for (const entry of forbiddenPatterns) {
    const index = source.indexOf(entry.pattern)
    if (index === -1) {
      continue
    }
    errors.push({
      filePath,
      line: getLineNumber(source, index),
      rule: entry.rule,
      detail: entry.detail,
    })
  }
}

function auditInlineHandlerPatterns(filePath, source) {
  const matches = [
    { regex: /onclick\s*=/g, rule: 'inline-click-handler', detail: 'Use data-action routing instead of onclick=' },
    { regex: /onchange\s*=/g, rule: 'inline-change-handler', detail: 'Use data-action routing instead of onchange=' },
    { regex: /oninput\s*=/g, rule: 'inline-input-handler', detail: 'Use data-action routing instead of oninput=' },
    { regex: /onkeydown\s*=/g, rule: 'inline-keydown-handler', detail: 'Use data-action routing instead of onkeydown=' },
  ]

  for (const entry of matches) {
    const match = entry.regex.exec(source)
    if (!match) {
      continue
    }
    errors.push({
      filePath,
      line: getLineNumber(source, match.index),
      rule: entry.rule,
      detail: entry.detail,
    })
  }
}

for (const filePath of targetFiles) {
  const source = readFile(filePath)
  const declared = collectDeclaredNames(source)
  auditUndeclaredAssignments(filePath, source, declared)
  auditExpressionScope(filePath, source, declared)
  auditTopLevelCorePosApi(filePath, source)
  auditForbiddenPatterns(filePath, source)
  auditInlineHandlerPatterns(filePath, source)
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`${error.filePath}:${error.line} [${error.rule}] ${error.detail}`)
  }
  process.exit(1)
}

console.log('Runtime refactor audit passed.')
