<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import type { BuilderRuleView } from '../builder'
import { guideBuilderIssue } from '../runtime-support'
import { formatCurrency } from '../runtime-utils'
import BuilderChoiceCard from './BuilderChoiceCard.vue'
import ItemImageButton from './ItemImageButton.vue'

const { sales } = usePosRuntime()
const { builder } = sales
const host = useTemplateRef<HTMLElement>('host')

// Every redraw points staff at the first unfinished group, like the previous builder did.
watch(
  builder,
  (view) => {
    if (view?.issueGroupId && host.value) {
      guideBuilderIssue(host.value, view.issueGroupId)
    }
  },
  { flush: 'post' }
)

function ruleText(rule: BuilderRuleView) {
  return rule.kind === 'single' ? undefined : { value: rule.value || '', placeholder: rule.placeholder }
}

function isMissing(rule: BuilderRuleView) {
  return Boolean(rule.required && !rule.value)
}

function onQuantityChange(event: Event) {
  sales.setBuilderQuantity((event.target as HTMLInputElement).value)
}
</script>

<template>
  <div id="builderHost" ref="host">
    <div v-if="builder && !builder.presentation" class="builder-modal-shell">
      <div class="builder-card builder-modal-card">
        <div class="builder-missing-message">找不到商品</div>
        <div class="builder-footer builder-footer-compact">
          <div class="builder-actions">
            <button type="button" class="builder-cancel-btn btn-effect" @click="sales.closeBuilder()">取消</button>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="builder?.presentation" class="builder-modal-shell">
      <div class="builder-card builder-modal-card" :data-builder-group="builder.presentation.item.id">
        <div class="builder-card-head">
          <ItemImageButton class="builder-item-image" :item="builder.presentation.item" />
          <div class="builder-title-group">
            <h3>{{ builder.presentation.title }}</h3>
            <p>{{ builder.presentation.subtitle || '完成必填欄位後即可加入購物車' }}</p>
          </div>
          <div class="builder-price">{{ formatCurrency(builder.presentation.subtotal) }}</div>
        </div>

        <div class="builder-section">
          <h4>主商品設定</h4>
          <div class="builder-rule-list">
            <div
              v-for="block in builder.presentation.mainBlocks"
              :key="block.id"
              class="builder-rule-card"
              :data-builder-block="block.id"
            >
              <div class="builder-rule-list">
                <div v-for="(row, rowIndex) in block.rows" :key="rowIndex" class="builder-block-row">
                  <BuilderChoiceCard
                    v-for="rule in row"
                    :key="rule.id"
                    :group-id="rule.id"
                    :label="rule.label"
                    :required="rule.required"
                    :missing="isMissing(rule)"
                    :issue-group-id="builder.issueGroupId"
                    :options="rule.options"
                    :text="ruleText(rule)"
                    @select="sales.selectBuilderMain(rule.id, $event)"
                    @input="sales.selectBuilderMain(rule.id, $event, false)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="builder.presentation.childBlocks.length > 0" class="builder-section">
          <h4>附飲 / 換購</h4>
          <div class="builder-include-list">
            <div
              v-for="block in builder.presentation.childBlocks"
              :key="block.includeId"
              class="builder-include-card"
              :class="{
                missing: block.rules.some(isMissing),
                'issue-target': builder.issueGroupId === block.includeId,
              }"
              :data-builder-group="block.includeId"
            >
              <div class="builder-include-head">
                <strong>{{ `${block.label}${block.itemShortName ? `：${block.itemShortName}` : ''}` }}</strong>
                <span v-if="block.priceDelta > 0" class="builder-meta-badge">{{ `+${formatCurrency(block.priceDelta)}` }}</span>
              </div>
              <div class="builder-rule-list">
                <BuilderChoiceCard
                  v-if="block.optionGroup"
                  :group-id="block.optionGroup.id"
                  :label="block.optionGroup.label"
                  :required="block.optionGroup.required"
                  :missing="block.optionGroup.required && !block.optionGroup.selectedValue"
                  :issue-group-id="builder.issueGroupId"
                  :options="block.optionGroup.options"
                  @select="sales.selectBuilderUpgrade(block.optionGroup.id, $event)"
                />
                <BuilderChoiceCard
                  v-for="rule in block.rules"
                  :key="rule.id"
                  :group-id="`${block.includeId}.${rule.id}`"
                  :label="rule.label"
                  :required="rule.required"
                  :missing="isMissing(rule)"
                  :issue-group-id="builder.issueGroupId"
                  :options="rule.options"
                  :text="ruleText(rule)"
                  @select="sales.selectBuilderInclude(block.includeId, rule.id, $event)"
                  @input="sales.selectBuilderInclude(block.includeId, rule.id, $event, false)"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-if="builder.presentation.upgradeGroups.length > 0" class="builder-section">
          <h4>加購 / 其他選項</h4>
          <div class="builder-rule-list">
            <BuilderChoiceCard
              v-for="group in builder.presentation.upgradeGroups"
              :key="group.id"
              :group-id="group.id"
              :label="group.label"
              :required="group.required"
              :missing="group.required && !group.selectedValue"
              :issue-group-id="builder.issueGroupId"
              :options="group.options"
              @select="sales.selectBuilderUpgrade(group.id, $event)"
            />
          </div>
        </div>

        <div class="builder-footer">
          <div class="builder-quantity-box">
            <button type="button" class="builder-qty-btn btn-effect" @click="sales.adjustBuilderQuantity(-1)">-</button>
            <input
              id="builderQtyInput"
              class="builder-qty-input"
              type="number"
              min="1"
              :value="builder.presentation.quantity"
              @change="onQuantityChange"
            >
            <button type="button" class="builder-qty-btn btn-effect" @click="sales.adjustBuilderQuantity(1)">+</button>
          </div>
          <div class="builder-actions">
            <button type="button" class="builder-cancel-btn btn-effect" @click="sales.closeBuilder()">取消</button>
            <button type="button"
              class="builder-confirm-btn btn-effect"
              :disabled="!builder.presentation.canConfirm"
              @click="sales.commitBuilder()"
            >
              {{ builder.editing ? '更新' : '加入購物車' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
