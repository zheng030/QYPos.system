import type {
  BuilderChildBlockView,
  BuilderMainBlockView,
  BuilderPresentation,
  BuilderRuleView,
  BuilderUpgradeGroupView,
} from './builder'
import { renderItemImageButton } from './runtime-utils'

function formatCurrency(value: number) {
  return `$${Math.round(value || 0)}`
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderUpgradeGroupControl(group: BuilderUpgradeGroupView) {
  const missing = group.required && !group.selectedValue
  return `
    <div class="builder-rule-card${missing ? ' missing' : ''}" data-builder-group="${escapeHtml(group.id)}">
      <div class="builder-rule-head">
        <strong>${escapeHtml(group.label)}${group.required ? '<span class="builder-required">必填</span>' : ''}</strong>
      </div>
      <div class="builder-option-grid">
        ${group.options
          .map(
            (option) => `
              <button
                class="builder-option-btn btn-effect${option.selected ? ' active' : ''}"
                data-action="builder-select-upgrade"
                data-group-id="${escapeHtml(group.id)}"
                data-value="${escapeHtml(option.value)}"
                ${option.disabled ? 'disabled' : ''}
              >
                ${escapeHtml(option.label)}${option.priceDelta ? ` +${formatCurrency(option.priceDelta)}` : ''}
              </button>
            `
          )
          .join('')}
      </div>
    </div>
  `
}

function renderRuleControl(rule: BuilderRuleView, scope: 'main' | 'include', includeId?: string) {
  const missing = Boolean(rule.required && !rule.value)
  const builderGroupId = scope === 'main' ? rule.id : includeId ? `${includeId}.${rule.id}` : rule.id
  const cardClass = `builder-rule-card${missing ? ' missing' : ''}`
  const actionAttrs =
    scope === 'main'
      ? `data-action="builder-select-main" data-rule-id="${escapeHtml(rule.id)}"`
      : `data-action="builder-select-include" data-include-id="${escapeHtml(includeId || '')}" data-rule-id="${escapeHtml(rule.id)}"`
  const options =
    rule.kind === 'single'
      ? `<div class="builder-option-grid">${(rule.options || [])
          .map(
            (option) => `
              <button
                class="builder-option-btn btn-effect${option.selected ? ' active' : ''}"
                ${actionAttrs}
                data-value="${escapeHtml(option.value)}"
                ${option.disabled ? 'disabled' : ''}
              >
                ${escapeHtml(option.label)}${option.priceDelta ? ` +${formatCurrency(option.priceDelta)}` : ''}
              </button>
            `
          )
          .join('')}</div>`
      : `
          <input
            class="builder-input"
            type="text"
            ${actionAttrs}
            value="${escapeHtml(rule.value || '')}"
            placeholder="${escapeHtml(rule.placeholder || '請輸入')}"
          >
        `
  return `
    <div class="${cardClass}" data-builder-group="${escapeHtml(builderGroupId)}">
      <div class="builder-rule-head">
        <strong>${escapeHtml(rule.label)}${rule.required ? '<span class="builder-required">必填</span>' : ''}</strong>
      </div>
      ${options}
    </div>
  `
}

function renderMainBlock(block: BuilderMainBlockView) {
  return `
    <div class="builder-rule-card" data-builder-block="${escapeHtml(block.id)}">
      <div class="builder-rule-list">
        ${block.rows
          .map(
            (row) => `
              <div class="builder-block-row">
                ${row.map((rule) => renderRuleControl(rule, 'main')).join('')}
              </div>
            `
          )
          .join('')}
      </div>
    </div>
  `
}

function renderChildBlock(block: BuilderChildBlockView) {
  return `
    <div class="builder-include-card${block.rules.some((rule) => rule.required && !rule.value) ? ' missing' : ''}" data-builder-group="${escapeHtml(block.includeId)}">
      <div class="builder-include-head">
        <strong>${escapeHtml(block.label)}${block.itemShortName ? `：${escapeHtml(block.itemShortName)}` : ''}</strong>
        ${block.priceDelta > 0 ? `<span class="builder-meta-badge">+${formatCurrency(block.priceDelta)}</span>` : ''}
      </div>
      <div class="builder-rule-list">
        ${block.optionGroup ? renderUpgradeGroupControl(block.optionGroup) : ''}
        ${block.rules.map((rule) => renderRuleControl(rule, 'include', block.includeId)).join('')}
      </div>
    </div>
  `
}

export function renderBuilderMarkup({
  presentation,
  editing,
  issueMessage: _issueMessage,
}: {
  presentation: BuilderPresentation
  editing: boolean
  issueMessage?: string
}) {
  const childBlocks = presentation.childBlocks.map(renderChildBlock).join('')
  const image = renderItemImageButton(presentation.item, 'builder-item-image')

  return `
    <div class="builder-modal-shell">
      <div class="builder-card builder-modal-card" data-builder-group="${escapeHtml(presentation.item.id)}">
        <div class="builder-card-head">
          ${image}
          <div class="builder-title-group">
            <h3>${escapeHtml(presentation.title)}</h3>
            ${presentation.subtitle ? `<p>${escapeHtml(presentation.subtitle)}</p>` : '<p>完成必填欄位後即可加入購物車</p>'}
          </div>
          <div class="builder-price">${formatCurrency(presentation.subtotal)}</div>
        </div>

        <div class="builder-section">
          <h4>主商品設定</h4>
          <div class="builder-rule-list">
            ${presentation.mainBlocks.map((block) => renderMainBlock(block)).join('')}
          </div>
        </div>

        ${
          childBlocks
            ? `
              <div class="builder-section">
                <h4>附飲 / 換購</h4>
                <div class="builder-include-list">${childBlocks}</div>
              </div>
            `
            : ''
        }

        ${
          presentation.upgradeGroups.length > 0
            ? `
              <div class="builder-section">
                <h4>加購 / 其他選項</h4>
                <div class="builder-rule-list">
                  ${presentation.upgradeGroups.map((group) => renderUpgradeGroupControl(group)).join('')}
                </div>
              </div>
            `
            : ''
        }

        <div class="builder-footer">
          <div class="builder-quantity-box">
            <button class="builder-qty-btn btn-effect" data-action="builder-adjust-qty" data-delta="-1">-</button>
            <input class="builder-qty-input" id="builderQtyInput" data-action="builder-set-qty" type="number" min="1" value="${presentation.quantity}">
            <button class="builder-qty-btn btn-effect" data-action="builder-adjust-qty" data-delta="1">+</button>
          </div>
          <div class="builder-actions">
            <button class="builder-cancel-btn btn-effect" data-action="builder-cancel">取消</button>
            <button class="builder-confirm-btn btn-effect" data-action="builder-confirm" ${presentation.canConfirm ? '' : 'disabled'}>${editing ? '更新' : '加入購物車'}</button>
          </div>
        </div>
      </div>
    </div>
  `
}

export function renderBuilderMissingMarkup(message: string) {
  return `
    <div class="builder-modal-shell">
      <div class="builder-card builder-modal-card">
        <div class="builder-missing-message">${escapeHtml(message)}</div>
        <div class="builder-footer builder-footer-compact">
          <div class="builder-actions">
            <button class="builder-cancel-btn btn-effect" data-action="builder-cancel">取消</button>
          </div>
        </div>
      </div>
    </div>
  `
}
