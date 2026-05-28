import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const appShellPath = path.join(rootDir, 'src/app/app-shell.ts')
const frontendPath = path.join(rootDir, 'frontend/index.html')

const appShellSource = fs.readFileSync(appShellPath, 'utf8')
const frontendSource = fs.readFileSync(frontendPath, 'utf8')

const errors = []

const canonicalModalIds = [
  'summaryModal',
  'paymentModal',
  'checkoutModal',
  'reprintSelectionModal',
  'ownerLoginModal',
  'changePasswordModal',
  'discountModal',
  'allowanceModal',
  'financeDetailModal',
  'customModal',
  'drinkModal',
  'foodOptionModal',
  'qrCodeModal',
  'incomingOrderModal',
  'revenueDetailModal',
]

const forbiddenPatterns = [
  ['class="custom-modal"', 'Use canonical `.modal` wrappers only'],
  ['document.createElement(\'style\')', 'Runtime style injection is forbidden'],
  ['document.createElement("style")', 'Runtime style injection is forbidden'],
  ['fdBody', 'Use canonical finance detail field ids from `/frontend`'],
  ['revModalTitle', 'Use canonical revenue detail title id `revenueDetailTitle`'],
  ['revModalBody', 'Use canonical revenue detail body id `revenueDetailList`'],
]

const requiredIds = [
  'sumCount',
  'sumTotal',
  'payOriginal',
  'payDiscLabel',
  'payAllowance',
  'payFinal',
  'fdBarRev',
  'fdBarCost',
  'fdBarProfit',
  'fdBbqRev',
  'fdBbqCost',
  'fdBbqProfit',
  'fdTotalRev',
  'fdTotalCost',
  'fdTotalProfit',
  'revenueDetailTitle',
  'revenueDetailList',
  'statsHighlighter',
]

const requiredClasses = [
  'modal',
  'modal-content',
  'modal-header',
  'modal-body',
  'split-modal',
  'reprint-modal',
  'modal-content-owner',
  'payment-info',
  'pay-row',
  'summary-item',
  'fin-detail-card',
  'custom-section',
  'custom-label',
  'extra-shot-btn',
  'owner-buttons',
  'stats-page-grid',
  'stats-card-container',
]

for (const [pattern, detail] of forbiddenPatterns) {
  const index = appShellSource.indexOf(pattern)
  if (index !== -1) {
    errors.push(`${relative(appShellPath)}:${lineOf(appShellSource, index)} ${detail}`)
  }
}

for (const modalId of canonicalModalIds) {
  if (!hasModalWrapper(appShellSource, modalId)) {
    errors.push(`${relative(appShellPath)} missing canonical modal wrapper for #${modalId}`)
  }
  if (!hasModalWrapper(frontendSource, modalId)) {
    errors.push(`${relative(frontendPath)} missing canonical modal wrapper for #${modalId}`)
  }
}

for (const id of requiredIds) {
  if (!appShellSource.includes(`id="${id}"`)) {
    errors.push(`${relative(appShellPath)} missing required id "${id}"`)
  }
}

for (const className of requiredClasses) {
  if (!appShellSource.includes(`class="${className}`) && !appShellSource.includes(` ${className}"`) && !appShellSource.includes(` ${className} `)) {
    errors.push(`${relative(appShellPath)} missing required class "${className}"`)
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error)
  }
  process.exit(1)
}

console.log('UI parity audit passed.')

function hasModalWrapper(source, modalId) {
  return source.includes(`id="${modalId}" class="modal"`) || source.includes(`id="${modalId}" class="modal" `)
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length
}

function relative(filePath) {
  return path.relative(rootDir, filePath)
}
