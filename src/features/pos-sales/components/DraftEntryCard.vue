<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'
import type { PosOrderEntry } from '@/features/pos-kernel/types'

import { getEntryAdjustedAmountDisplay } from '../runtime-support'
import { formatCurrency, getVisibleDetailChildLines } from '../runtime-utils'
import AdjustedAmount from './AdjustedAmount.vue'
import EntrySubtitles from './EntrySubtitles.vue'
import EntryThumb from './EntryThumb.vue'

const props = defineProps<{ entry: PosOrderEntry }>()
const { kernel, sales } = usePosRuntime()
const { mode } = sales

const summary = computed(() => kernel.helpers.buildEntryDisplaySummary(props.entry))
const childLines = computed(() => getVisibleDetailChildLines(props.entry))
const isTreat = computed(() => sales.isEntryTreat(props.entry))
</script>

<template>
  <article class="entry-card">
    <div class="entry-card-head">
      <EntryThumb class="entry-card-thumb" :entry="entry" />
      <div>
        <div class="entry-card-title">{{ entry.summary.title }}</div>
        <EntrySubtitles :lines="[{ text: summary.mainSummary }]" />
      </div>
      <div class="entry-card-total"><AdjustedAmount :display="getEntryAdjustedAmountDisplay(entry)" /></div>
    </div>
    <div v-if="childLines.length > 0" class="entry-child-list">
      <div v-for="line in childLines" :key="line.lineId" class="entry-child-line">
        {{ `${line.shortName}${line.selectionSummary ? ` · ${line.selectionSummary}` : ''}${line.lineTotal > 0 ? ` ${formatCurrency(line.lineTotal)}` : ''}` }}
      </div>
    </div>
    <div class="entry-card-head" style="margin-top:12px;">
      <div>
        <EntrySubtitles :lines="[{ text: entry.summary.quantityLabel }, { text: summary.drinkSummary }]" />
      </div>
      <div class="entry-card-actions">
        <button type="button" class="mini-btn primary btn-effect" @click="sales.editDraftEntry(entry.entryId)">編輯</button>
        <button type="button"
          v-if="mode === 'staff'"
          class="mini-btn btn-effect"
          :class="isTreat ? 'success' : 'warning'"
          @click="sales.toggleDraftEntryTreat(entry.entryId)"
        >
          {{ isTreat ? '取消招待' : '招待' }}
        </button>
        <button type="button" class="mini-btn danger btn-effect" @click="sales.removeDraftEntry(entry.entryId)">刪除</button>
      </div>
    </div>
  </article>
</template>
