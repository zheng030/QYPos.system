<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'
import type { PosOrderBatch, PosOrderEntry } from '@/features/pos-kernel/types'
import { groupOrderLines } from '@/shared/grouped-order-lines'

import { getEntryAdjustedAmountDisplay } from '../runtime-support'
import { formatCurrency, groupChildLines } from '../runtime-utils'
import AdjustedAmount from './AdjustedAmount.vue'
import EntrySubtitles from './EntrySubtitles.vue'
import EntryThumb from './EntryThumb.vue'

defineProps<{ batch: PosOrderBatch; editable: boolean; pending: boolean }>()
const { kernel, sales } = usePosRuntime()

function childLines(entry: PosOrderEntry) {
  return (groupOrderLines(entry.lines)[0]?.children || groupChildLines(entry)).filter(
    (line) => line.courseKind !== 'drink'
  )
}
</script>

<template>
  <article class="batch-card" :class="pending ? 'pending' : 'accepted'">
    <div class="batch-card-head">
      <div>
        <div class="batch-card-title">
          {{ batch.requestLabel }} <span class="batch-chip" :class="pending ? 'pending' : 'accepted'">{{ pending ? '待接單' : '已接單' }}</span>
        </div>
        <div class="batch-card-subtitle">
          {{ `${batch.customer?.name || ''}${batch.customer?.phone ? ` · ${batch.customer.phone}` : ''}` }}
        </div>
      </div>
      <div class="batch-card-total">{{ formatCurrency(batch.subtotal) }}</div>
    </div>
    <div class="batch-entry-list">
      <div v-for="entry in batch.entries" :key="entry.entryId" class="entry-line-row">
        <EntryThumb class="entry-card-thumb" :entry="entry" />
        <div>
          <div class="entry-card-title">{{ entry.summary.title }}</div>
          <EntrySubtitles
            :lines="[
              { text: entry.summary.quantityLabel },
              { text: kernel.helpers.buildEntryDisplaySummary(entry).mainSummary },
              { text: kernel.helpers.buildEntryDisplaySummary(entry).drinkSummary },
            ]"
          />
          <div v-for="line in childLines(entry)" :key="line.lineId" class="entry-child-line">
            {{ `${line.shortName}${line.selectionSummary ? ` · ${line.selectionSummary}` : ''}` }}
          </div>
          <div v-if="editable && !pending" class="entry-card-actions">
            <button type="button" class="mini-btn primary btn-effect" @click="sales.editSubmittedEntry(batch.batchId, entry.entryId)">
              編輯
            </button>
          </div>
        </div>
        <div class="entry-card-total"><AdjustedAmount :display="getEntryAdjustedAmountDisplay(entry)" /></div>
      </div>
    </div>
    <div v-if="editable && !pending" class="batch-card-actions">
      <button type="button" class="mini-btn primary btn-effect" @click="sales.editSubmittedEntry(batch.batchId)">編輯</button>
      <button type="button" class="mini-btn primary btn-effect" @click="sales.reprintSubmittedBatch(batch.batchId)">補印</button>
    </div>
  </article>
</template>
