<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'

const { router, shell, reporting } = usePosRuntime()
const { reportSegment, reportSummary, calendarTitle, calendarCells } = reporting

const segments = [
  { range: 'day', label: '今日' },
  { range: 'week', label: '本周' },
  { range: 'month', label: '當月' },
]
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
</script>

<template>
  <div id="reportPage" :style="{ display: router.pageDisplay('reportPage') }">
    <button type="button" class="back btn-effect" @click="shell.goHome()">返回主畫面</button>
    <div class="title">營業報表</div>
    <div id="reportContent">
      <div class="segment-control-wrapper">
        <div class="segment-control-container">
          <div
            id="reportHighlighter"
            class="segment-highlighter"
            :style="reportSegment === null ? undefined : { transform: `translateX(${reportSegment * 100}%)` }"
          />
          <div
            v-for="(segment, index) in segments"
            :key="segment.range"
            class="segment-option"
            :class="{ active: (reportSegment ?? 0) === index }"
            @click="reporting.generateReport(segment.range)"
          >
            {{ segment.label }}
          </div>
        </div>
      </div>
      <div class="report-dashboard">
        <div class="stat-card total-gradient">
          <h3 id="rptTitle">{{ reportSummary.title }}</h3>
          <p id="rptTotal">{{ reportSummary.total }}</p>
          <small id="rptCount">{{ reportSummary.count }}</small>
        </div>
        <div class="stat-card primary-gradient">
          <h3>主餐組合</h3>
          <p id="rptPrimary">{{ reportSummary.primary }}</p>
          <small>以新分類統計</small>
        </div>
        <div class="stat-card secondary-gradient">
          <h3>其餘品類</h3>
          <p id="rptSecondary">{{ reportSummary.secondary }}</p>
          <small>以新分類統計</small>
        </div>
      </div>
    </div>
    <div class="calendar-wrapper">
      <div class="calendar-header">
        <h2 id="calendarMonthTitle">{{ calendarTitle }}</h2>
      </div>
      <div class="calendar-grid-header">
        <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
      </div>
      <div id="calendarGrid" class="calendar-grid">
        <template v-for="(cell, index) in calendarCells" :key="index">
          <div v-if="!cell" class="calendar-day empty" />
          <div v-else class="calendar-day">
            <div class="day-num">{{ cell.day }}</div>
            <div class="day-revenue">{{ cell.revenue }}</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
