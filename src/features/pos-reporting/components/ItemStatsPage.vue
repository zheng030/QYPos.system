<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'

import type { ItemStatsRange } from '../reporting-store'

const { router, shell, reporting } = usePosRuntime()
const { itemStatsActive, customStatsVisible, statsDates, itemStatsColumns } = reporting

const options: Array<{ id: string; range: ItemStatsRange; label: string }> = [
  { id: 'statBtnDay', range: 'day', label: '今日' },
  { id: 'statBtnWeek', range: 'week', label: '本周' },
  { id: 'statBtnMonth', range: 'month', label: '當月' },
  { id: 'statBtnCustom', range: 'custom', label: '特定日期' },
]

function rankClass(index: number) {
  return index < 3 ? `top-${index + 1}` : ''
}

function onDateChange(field: 'start' | 'end', event: Event) {
  reporting.setStatsDate(field, (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div id="itemStatsPage" :style="{ display: router.pageDisplay('itemStatsPage') }">
    <button type="button" class="back btn-effect" @click="shell.goHome()">返回主畫面</button>
    <div class="title">商品銷售統計</div>
    <div class="segment-control-wrapper" style="flex-direction: column; align-items: center;">
      <div class="segment-control-container" style="width: 420px;">
        <div id="statsHighlighter" class="segment-highlighter" />
        <div
          v-for="option in options"
          :id="option.id"
          :key="option.id"
          class="segment-option"
          :class="{ active: itemStatsActive === option.range }"
          @click="reporting.renderItemStats(option.range, true)"
        >
          {{ option.label }}
        </div>
      </div>
      <div
        id="customStatsDateRange"
        class="segment-control-container"
        :style="{ display: customStatsVisible ? 'flex' : 'none' }"
      >
        <input id="statsStartDate" type="date" :value="statsDates.start" @change="onDateChange('start', $event)">
        <span>～</span>
        <input id="statsEndDate" type="date" :value="statsDates.end" @change="onDateChange('end', $event)">
      </div>
    </div>
    <div class="stats-page-grid">
      <div id="itemStatsColumns" class="stats-columns-grid">
        <section v-for="column in itemStatsColumns" :key="column.key" class="stats-category-card">
          <h3>{{ column.title }}</h3>
          <div class="stats-header-row"><span>品項</span><span>數量</span></div>
          <div class="stats-list-content">
            <div v-if="column.rows.length === 0" style="text-align:center; padding:20px; color:#ccc;">無銷量資料</div>
            <div v-for="(row, index) in column.rows" :key="row.name" class="stats-row-item">
              <div class="rank-badge" :class="rankClass(index)">{{ index + 1 }}</div>
              <span class="stats-name">{{ row.name }}</span>
              <span class="stats-val">{{ row.count }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
