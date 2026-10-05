<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'
import type { PosOrderEntry } from '@/features/pos-kernel/types'

import { getEntryAdjustedAmountDisplay } from '../runtime-support'
import AdjustedAmount from './AdjustedAmount.vue'
import EntrySubtitles from './EntrySubtitles.vue'

defineProps<{ entries: PosOrderEntry[]; selected: boolean; emptyText: string }>()
const { kernel, sales } = usePosRuntime()

function childLines(entry: PosOrderEntry) {
  return entry.lines.filter((line) => line.parentLineId && line.courseKind !== 'drink')
}
</script>

<template>
  <div v-if="entries.length === 0" class="entry-card">{{ emptyText }}</div>
  <article v-for="entry in entries" :key="entry.entryId" class="entry-card">
    <div class="entry-card-head">
      <div>
        <div class="entry-card-title">{{ entry.summary.title }}</div>
        <EntrySubtitles
          :lines="[
            { text: entry.summary.quantityLabel },
            { text: kernel.helpers.buildEntryDisplaySummary(entry).mainSummary },
            { text: kernel.helpers.buildEntryDisplaySummary(entry).drinkSummary },
          ]"
        />
      </div>
      <div class="entry-card-total"><AdjustedAmount :display="getEntryAdjustedAmountDisplay(entry)" /></div>
    </div>
    <div v-if="childLines(entry).length > 0" class="entry-child-list">
      <div v-for="line in childLines(entry)" :key="line.lineId" class="entry-child-line">
        {{ `${line.shortName}${line.selectionSummary ? ` · ${line.selectionSummary}` : ''}` }}
      </div>
    </div>
    <div class="entry-card-actions" style="margin-top:12px;">
      <button type="button" class="mini-btn primary btn-effect" @click="sales.moveSplitEntry(entry.entryId, !selected)">
        {{ selected ? '移回未結帳' : '加入本次結帳' }}
      </button>
    </div>
  </article>
</template>
