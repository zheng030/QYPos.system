import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const rootDir = process.cwd()
const srcDir = path.join(rootDir, 'src')
const rootMarkupFiles = [path.join(rootDir, 'index.html')]

const styleFiles = []
const tsFiles = []

walk(srcDir)

const cssClassDefs = new Map()
const markupClassUses = new Map()
const selectorClassUses = new Map()
const markupIdDefs = new Map()
const domIdRefs = new Map()

for (const filePath of styleFiles) {
  collectCssSelectors(filePath, readFile(filePath))
}

for (const filePath of tsFiles) {
  collectTsContracts(filePath, readFile(filePath))
}

for (const filePath of rootMarkupFiles) {
  if (fs.existsSync(filePath)) {
    collectMarkupFromStaticHtml(readFile(filePath), filePath, 1)
  }
}

const missingMarkupClassesInCss = difference(markupClassUses, cssClassDefs)
const missingSelectorClassesInCss = difference(selectorClassUses, cssClassDefs)
const missingReferencedIdsInMarkup = difference(domIdRefs, markupIdDefs)

const reportSections = [
  ['TS markup classes without CSS rules', missingMarkupClassesInCss],
  ['TS selector/classList classes without CSS rules', missingSelectorClassesInCss],
  ['Referenced ids without markup definitions', missingReferencedIdsInMarkup],
]

const hasIssues = reportSections.some(([, entries]) => entries.size > 0)

if (!hasIssues) {
  console.log('Style contract audit passed.')
  process.exit(0)
}

for (const [title, entries] of reportSections) {
  if (entries.size === 0) {
    continue
  }
  console.error(`\n[${title}]`)
  for (const [name, refs] of sortMap(entries)) {
    console.error(`- ${name} <- ${formatRefs(refs)}`)
  }
}

process.exit(1)

function walk(currentDir) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (entry.name.endsWith('.css')) {
      styleFiles.push(fullPath)
      continue
    }
    if (entry.name.endsWith('.ts')) {
      tsFiles.push(fullPath)
    }
  }
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function collectCssSelectors(filePath, source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const selectorGroup = match[1].trim()
    if (!selectorGroup || selectorGroup.startsWith('@')) {
      continue
    }
    const line = getLineNumber(source, match.index)
    for (const selector of selectorGroup.split(',')) {
      collectClassNamesFromSelector(selector, (className) => addRef(cssClassDefs, className, filePath, line))
    }
  }
}

function collectTsContracts(filePath, source) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  function visit(node) {
    if (ts.isJsxAttribute(node)) {
      handleJsxAttribute(node, filePath, sourceFile)
    }

    if (ts.isCallExpression(node)) {
      handleCallExpression(node, filePath, sourceFile)
    }

    if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) {
      collectMarkupFromStaticHtml(node.text, filePath, getLineAndCharacter(sourceFile, node.getStart(sourceFile)).line + 1)
    }

  if (ts.isTemplateExpression(node)) {
      collectMarkupFromTemplate(node, filePath, sourceFile)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function handleJsxAttribute(node, filePath, sourceFile) {
  const attributeName = node.name.text
  if (!node.initializer || !ts.isStringLiteral(node.initializer)) {
    return
  }
  const line = getLineAndCharacter(sourceFile, node.getStart(sourceFile)).line + 1
  if (attributeName === 'class' || attributeName === 'className') {
    for (const className of splitClassTokens(node.initializer.text)) {
      addRef(markupClassUses, className, filePath, line)
    }
  }
  if (attributeName === 'id') {
    const id = node.initializer.text.trim()
    if (isStaticToken(id)) {
      addRef(markupIdDefs, id, filePath, line)
    }
  }
}

function handleCallExpression(node, filePath, sourceFile) {
  const callee = getCallExpressionName(node.expression)
  if (!callee) {
    return
  }

  const line = getLineAndCharacter(sourceFile, node.getStart(sourceFile)).line + 1

  if (callee === 'getElementById' || callee === 'requireElement' || callee === 'requireInput' || callee === 'getLegacyElement') {
    const literal = getStaticStringArgument(node.arguments[0])
    if (literal && isStaticToken(literal)) {
      addRef(domIdRefs, literal, filePath, line)
    }
    return
  }

  if (
    callee === 'querySelector' ||
    callee === 'querySelectorAll' ||
    callee === 'closest' ||
    callee === 'matches' ||
    callee === 'requireSelector' ||
    callee === 'requireSelectorAll'
  ) {
    const selector = getStaticStringArgument(node.arguments[0])
    if (!selector) {
      return
    }
    collectClassNamesFromSelector(selector, (className) => addRef(selectorClassUses, className, filePath, line))
    collectIdsFromSelector(selector, (id) => addRef(domIdRefs, id, filePath, line))
    return
  }

  if (
    (callee === 'add' || callee === 'remove' || callee === 'toggle' || callee === 'contains') &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.getText(sourceFile).endsWith('classList')
  ) {
    for (const arg of node.arguments) {
      const literal = getStaticStringArgument(arg)
      if (!literal) {
        continue
      }
      for (const className of splitClassTokens(literal)) {
        addRef(selectorClassUses, className, filePath, line)
      }
    }
  }
}

function collectMarkupFromTemplate(node, filePath, sourceFile) {
  const line = getLineAndCharacter(sourceFile, node.getStart(sourceFile)).line + 1
  let html = `${getStaticTemplatePrefix(node.getText(sourceFile))}${node.head.text}`
  for (const span of node.templateSpans) {
    html += getStaticPlaceholderForExpression(span.expression, sourceFile)
    html += span.literal.text
  }
  collectMarkupFromStaticHtml(html, filePath, line)
}

function collectMarkupFromStaticHtml(source, filePath, baseLine) {
  for (const match of source.matchAll(/class\s*=\s*["']([^"']+)["']/g)) {
    const line = baseLine + countNewlines(source.slice(0, match.index))
    for (const className of splitClassTokens(match[1])) {
      addRef(markupClassUses, className, filePath, line)
    }
  }
  for (const match of source.matchAll(/id\s*=\s*["']([^"']+)["']/g)) {
    const line = baseLine + countNewlines(source.slice(0, match.index))
    const id = match[1].trim()
    if (!isStaticToken(id)) {
      continue
    }
    addRef(markupIdDefs, id, filePath, line)
  }
}

function getCallExpressionName(expression) {
  if (ts.isIdentifier(expression)) {
    return expression.text
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text
  }
  return null
}

function getStaticStringArgument(argument) {
  if (!argument) {
    return null
  }
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.text
  }
  return null
}

function collectClassNamesFromSelector(selector, onClassName) {
  for (const match of selector.matchAll(/\.([^\s.#:[\]>+~(),{}]+)/g)) {
    const className = match[1].trim()
    if (isStaticToken(className)) {
      onClassName(className)
    }
  }
}

function collectIdsFromSelector(selector, onId) {
  for (const match of selector.matchAll(/#([^\s.#:[\]>+~(),{}]+)/g)) {
    const id = match[1].trim()
    if (isStaticToken(id)) {
      onId(id)
    }
  }
}

function splitClassTokens(value) {
  return value
    .replace(/\{\{expr\}\}/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(isStaticToken)
}

function getStaticPlaceholderForExpression(expression, sourceFile) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text
  }

  if (ts.isConditionalExpression(expression)) {
    const whenTrue = getStaticPlaceholderForExpression(expression.whenTrue, sourceFile)
    const whenFalse = getStaticPlaceholderForExpression(expression.whenFalse, sourceFile)
    return ` ${whenTrue} ${whenFalse} `
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    const left = getStaticPlaceholderForExpression(expression.left, sourceFile)
    const right = getStaticPlaceholderForExpression(expression.right, sourceFile)
    return ` ${left} ${right} `
  }

  if (ts.isParenthesizedExpression(expression)) {
    return getStaticPlaceholderForExpression(expression.expression, sourceFile)
  }

  if (ts.isCallExpression(expression)) {
    const callee = getCallExpressionName(expression.expression)
    if (callee === 'renderAvatar') {
      const className = getStaticStringArgument(expression.arguments[1])
      return className ? ` ${className} ` : ' {{expr}} '
    }
    if (callee === 'getRecordMeta') {
      return ' checkin-tag checkin-tag--brand checkin-tag--slate checkin-tag--orange checkin-tag--green checkin-dot--brand checkin-dot--slate checkin-dot--orange checkin-dot--green checkin-text--brand checkin-text--slate checkin-text--orange checkin-text--green '
    }
    if (callee === 'getStatusDotClass' || callee === 'getStatusDotVariant') {
      return ' checkin-dot--brand checkin-dot--slate checkin-dot--orange checkin-dot--green '
    }
    if (callee === 'renderClockView') {
      return ' checkin-view--clock '
    }
    if (callee === 'renderEmployees') {
      return ' checkin-view--employees '
    }
    if (callee === 'renderIndividualDashboard') {
      return ' checkin-view--individual '
    }
    if (callee === 'renderChangePassword') {
      return ' checkin-view--password '
    }
    if (callee === 'icon') {
      return ''
    }
  }

    if (ts.isPropertyAccessExpression(expression)) {
      const text = expression.getText(sourceFile)
    if (text === 'state.currentView') {
      return ' clock dashboard individual reports employees password '
    }
    if (text === 'state.chartMode') {
      return ' week month '
    }
    if (text === 'state.viewMode') {
      return ' list calendar '
    }
    if (text === 'entry.hours') {
      return ' 0 1 '
    }
    if (text === 'item.variant') {
      return ' checkin-stat__icon--blue checkin-stat__icon--purple checkin-stat__icon--slate checkin-stat__icon--green checkin-stat__icon--orange '
    }
    if (text === 'flavor.spice') {
      return ' spice-小辣 spice-中辣 spice-大辣 '
    }
  }

  return ' {{expr}} '
}

function getStaticTemplatePrefix(templateText) {
  if (templateText.includes('checkin-stat__icon--${item.variant}')) {
    return ' checkin-stat__icon--blue checkin-stat__icon--purple checkin-stat__icon--slate checkin-stat__icon--green checkin-stat__icon--orange '
  }
  if (templateText.includes('spice-${flavor.spice}')) {
    return ' spice-小辣 spice-中辣 spice-大辣 '
  }
  return ''
}

function isStaticToken(token) {
  return Boolean(token) && /^[A-Za-z0-9_-]+$/.test(token) && !token.endsWith('--') && !token.endsWith('-')
}

function addRef(targetMap, name, filePath, line) {
  const refs = targetMap.get(name) ?? []
  refs.push({ filePath: toRelativePath(filePath), line })
  targetMap.set(name, refs)
}

function difference(leftMap, rightMap) {
  const result = new Map()
  for (const [name, refs] of leftMap.entries()) {
    if (rightMap.has(name)) {
      continue
    }
    result.set(name, refs)
  }
  return result
}

function mergeMaps(...maps) {
  const result = new Map()
  for (const map of maps) {
    for (const [name, refs] of map.entries()) {
      const current = result.get(name) ?? []
      result.set(name, current.concat(refs))
    }
  }
  return result
}

function sortMap(targetMap) {
  return [...targetMap.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function formatRefs(refs) {
  return dedupeRefs(refs)
    .map((ref) => `${ref.filePath}:${ref.line}`)
    .join(', ')
}

function dedupeRefs(refs) {
  const seen = new Set()
  const unique = []
  for (const ref of refs) {
    const key = `${ref.filePath}:${ref.line}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(ref)
  }
  return unique
}

function getLineAndCharacter(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position)
}

function getLineNumber(source, index) {
  return source.slice(0, index).split('\n').length
}

function countNewlines(source) {
  return (source.match(/\n/g) ?? []).length
}

function toRelativePath(filePath) {
  return path.relative(rootDir, filePath)
}
