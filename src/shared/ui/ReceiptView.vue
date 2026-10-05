<script setup lang="ts">
import { computed } from 'vue'

import type { PosReceiptData } from '@/features/pos-kernel/types'
import { groupOrderLines } from '@/shared/grouped-order-lines'

const props = defineProps<{ data: PosReceiptData; title: string }>()

const groups = computed(() => groupOrderLines(props.data.lines || []))

function formatCurrency(value: number) {
  return `$${Math.round(value || 0)}`
}

function formatQuantity(quantity: number | null | undefined) {
  return `x${typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? quantity : 1}`
}
</script>

<template>
  <section class="receipt-section">
    <div class="receipt-header">
      <h1 class="store-name">QY POS</h1>
      <strong>{{ title }}</strong>
    </div>
    <div class="receipt-info">
      <div>桌號：{{ data.table || '' }}</div>
      <div>時間：{{ data.time }}</div>
      <div>單號：{{ String(data.seq || '') }}</div>
    </div>
    <hr class="dashed-line">
    <div class="receipt-items">
      <template v-for="group in groups" :key="group.groupId">
        <div class="receipt-item">
          <span>{{ `${group.main.shortName} ${formatQuantity(group.main.quantity)}${group.main.selectionSummary ? ` (${group.main.selectionSummary})` : ''}` }}</span>
          <span>{{ formatCurrency(group.main.lineTotal) }}</span>
        </div>
        <div v-for="line in group.children" :key="line.lineId" class="entry-child-line">{{ `${line.shortName} ${formatQuantity(line.quantity)}${line.selectionSummary ? ` · ${line.selectionSummary}` : ''}${line.lineTotal > 0 ? ` ${formatCurrency(line.lineTotal)}` : ''}` }}</div>
      </template>
    </div>
    <hr class="dashed-line">
    <div class="receipt-footer">
      <div class="row">
        <span>原價</span><span>{{ formatCurrency(data.original || data.total) }}</span>
      </div>
      <div class="row total">
        <span>總計</span><span>{{ formatCurrency(data.total) }}</span>
      </div>
    </div>
  </section>
</template>
