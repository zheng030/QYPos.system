<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'
import type { PosOrderEntry } from '@/features/pos-kernel/types'

import {
  getEntryAdjustedAmountDisplay,
  getStaffWorkspaceRowActions,
  type StaffWorkspaceRow,
  type StaffWorkspaceRowAction,
} from '../runtime-support'
import { getStaffCategoryLabel } from '../runtime-utils'
import AdjustedAmount from './AdjustedAmount.vue'
import EntryThumb from './EntryThumb.vue'

const { kernel, sales } = usePosRuntime()
const { workspace, staffSummary } = sales

const meta = computed(() => {
  const { totals } = staffSummary.value
  const applied = workspace.discountPercent > 0 || workspace.serviceFeeEnabled ? ' · 已套用整單設定' : ''
  return `${totals.draftEntryCount} 項未送出 · ${totals.acceptedEntryCount} 項已接單 · ${totals.acceptedBatchCount} 張已接單${applied}`
})

function compactSummary(entry: PosOrderEntry) {
  const summary = kernel.helpers.buildEntryDisplaySummary(entry)
  return [entry.summary.quantityLabel, summary.mainCompact, summary.drinkCompact].filter(Boolean).join(' · ')
}

function runAction(row: StaffWorkspaceRow, action: StaffWorkspaceRowAction) {
  const entryId = row.entry.entryId
  if (row.kind === 'draft') {
    if (action.kind === 'edit') sales.editDraftEntry(entryId)
    else if (action.kind === 'treat') void sales.toggleDraftEntryTreat(entryId)
    else void sales.removeDraftEntry(entryId)
    return
  }
  if (action.kind === 'edit') sales.editSubmittedEntry(row.batchId, entryId)
  else if (action.kind === 'treat') void sales.toggleSubmittedEntryTreat(row.batchId, entryId)
  else void sales.removeSubmittedEntry(row.batchId, entryId)
}

function onToggleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  sales.toggleWorkspace()
}
</script>

<template>
  <div id="staffFloatingWorkspace" class="floating-bar-staff" :class="workspace.expanded ? 'is-expanded' : 'is-collapsed'">
    <div id="staffWorkspaceToggle" class="staff-workspace-toggle">
      <div
        id="staffWorkspaceToggleButton"
        class="staff-workspace-toggle-trigger"
        role="button"
        tabindex="0"
        :aria-expanded="workspace.expanded ? 'true' : 'false'"
        @click="sales.toggleWorkspace()"
        @keydown="onToggleKeydown"
      >
        <span class="staff-workspace-toggle-main">
          <span id="staffWorkspaceToggleLabel">{{ workspace.expanded ? '收合明細' : '展開明細' }}</span>
          <span id="staffWorkspaceMeta">{{ meta }}</span>
        </span>
        <span class="staff-workspace-toggle-side">
          <span class="staff-workspace-toggle-tools">
            <button type="button"
              id="staffServiceFeeBtn"
              class="btn-effect staff-tool-btn staff-tool-btn-fee"
              :class="{ active: workspace.serviceFeeEnabled }"
              @click.stop="sales.toggleServiceFee()"
              @keydown.stop
            >
              🧾 10%服務費
            </button>
            <button type="button"
              id="staffDiscountBtn"
              class="btn-effect staff-tool-btn staff-tool-btn-discount"
              :class="{ active: workspace.discountPercent > 0 }"
              @click.stop="sales.openDiscountModal()"
              @keydown.stop
            >
              {{ workspace.discountPercent > 0 ? `🏷️ ${workspace.discountPercent}%折數` : '🏷️ 折扣' }}
            </button>
          </span>
          <span id="staffWorkspaceTotal" class="staff-workspace-total"><AdjustedAmount :display="staffSummary.total" stacked /></span>
          <span class="staff-workspace-toggle-chevron" aria-hidden="true">⌄</span>
        </span>
      </div>
    </div>

    <div id="staffWorkspaceBody" class="staff-workspace-body">
      <div id="staffWorkspaceStreamList" class="staff-workspace-stream" :class="{ 'is-expanded': workspace.expanded }">
        <div v-if="staffSummary.totals.groups.length === 0" class="staff-stream-empty">目前沒有未送出或已接單品項</div>
        <article
          v-for="group in staffSummary.totals.groups"
          :key="group.kind === 'draft' ? 'draft' : group.batchId"
          class="staff-stream-row"
          :class="[group.kind, { 'is-collapsed': !workspace.expanded }]"
        >
          <div class="staff-stream-row-meta staff-stream-group-meta">
            <span class="staff-stream-chip" :class="group.kind">{{ group.statusLabel }}</span>
            <span v-if="group.requestLabel" class="staff-stream-ref">{{ group.requestLabel }}</span>
          </div>
          <div class="staff-stream-group-list">
            <template v-for="row in group.rows" :key="row.entry.entryId">
              <div v-if="!workspace.expanded" class="staff-stream-entry-line is-collapsed">
                <div class="staff-stream-row-inline">
                  <EntryThumb class="entry-card-thumb staff-entry-thumb" :entry="row.entry" />
                  <span class="staff-stream-row-inline-main">
                    <span class="staff-stream-inline-title">{{ row.entry.summary.title }}</span>
                    <span class="staff-stream-inline-summary">{{ compactSummary(row.entry) }}</span>
                  </span>
                  <span class="staff-stream-row-inline-side">
                    <span class="entry-card-total"><AdjustedAmount :display="getEntryAdjustedAmountDisplay(row.entry)" /></span>
                    <span class="staff-stream-row-actions-inline">
                      <div class="entry-card-actions entry-card-actions--compact">
                        <button type="button"
                          v-for="action in getStaffWorkspaceRowActions(sales.isEntryTreat(row.entry))"
                          :key="action.kind"
                          class="mini-btn mini-btn--compact btn-effect"
                          :class="action.tone"
                          @click="runAction(row, action)"
                        >
                          {{ action.label }}
                        </button>
                      </div>
                    </span>
                  </span>
                </div>
              </div>
              <div v-else class="staff-stream-entry-line">
                <div class="staff-stream-row-head">
                  <EntryThumb class="entry-card-thumb staff-entry-thumb" :entry="row.entry" />
                  <div class="staff-stream-row-title-group">
                    <div class="staff-stream-row-meta">
                      <span class="staff-category-chip">{{ getStaffCategoryLabel(row.entry.categoryKey) }}</span>
                      <div class="entry-card-title">{{ row.entry.summary.title }}</div>
                      <span class="staff-stream-title-qty">{{ row.entry.summary.quantityLabel }}</span>
                    </div>
                    <div v-if="kernel.helpers.buildEntryDisplaySummary(row.entry).expandedSummary" class="entry-card-subtitle">
                      {{ kernel.helpers.buildEntryDisplaySummary(row.entry).expandedSummary }}
                    </div>
                  </div>
                  <div class="entry-card-total"><AdjustedAmount :display="getEntryAdjustedAmountDisplay(row.entry)" /></div>
                </div>
                <div class="staff-stream-row-actions">
                  <div class="entry-card-actions entry-card-actions--compact">
                    <button type="button"
                      v-for="action in getStaffWorkspaceRowActions(sales.isEntryTreat(row.entry))"
                      :key="action.kind"
                      class="mini-btn mini-btn--compact btn-effect"
                      :class="action.tone"
                      @click="runAction(row, action)"
                    >
                      {{ action.label }}
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </article>
      </div>
    </div>

    <div class="staff-workspace-dock">
      <div class="staff-workspace-toolbar">
        <button type="button" class="btn-effect staff-tool-btn staff-tool-btn-save" @click="sales.saveAndExitStaffOrder()">📝 暫存</button>
        <button type="button" class="btn-effect staff-tool-btn staff-tool-btn-print" @click="sales.openReprintModal()">🖨️ 補單</button>
        <button type="button" class="btn-effect staff-tool-btn staff-tool-btn-pay" @click="sales.openPaymentModal()">💳 全結</button>
        <button type="button" class="btn-effect staff-tool-btn staff-tool-btn-split" @click="sales.openSplitCheckoutModal()">✂️ 拆單</button>
      </div>
    </div>
  </div>
</template>
