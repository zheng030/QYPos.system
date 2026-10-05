<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import type { FinanceRange } from '../owner-finance'

const { router, shell, admin } = usePosRuntime()
const finance = admin.finance
const {
  view,
  title,
  costCategories,
  calendarTitle,
  calendarCells,
  summary,
  activeRange,
  customRangeVisible,
  rangeDates,
  specificDay,
  orderList,
} = finance

const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const rangeButtons: Array<{ id: string; range: FinanceRange; label: string }> = [
  { id: 'finBtnDay', range: 'day', label: '今日' },
  { id: 'finBtnWeek', range: 'week', label: '本周' },
  { id: 'finBtnMonth', range: 'month', label: '當月' },
  { id: 'finBtnCustom', range: 'custom', label: '日期區間' },
]

// Sections keep their markup defaults until a mode is opened once.
const calendarSectionDisplay = computed(() => (view.value === null ? undefined : view.value === 'finance' ? 'block' : 'none'))
const costSectionDisplay = computed(() => (view.value === null ? undefined : view.value === 'cost' ? 'block' : 'none'))

function onRangeDateChange(field: 'start' | 'end', event: Event) {
  finance.setRangeDate(field, (event.target as HTMLInputElement).value)
}

function onItemDataChange(itemId: string, type: 'price' | 'cost', event: Event) {
  void finance.updateItemData(itemId, type, (event.target as HTMLInputElement).value)
}

function showReadonlyNotice() {
  alert('此介面僅供查帳')
}
</script>

<template>
  <div id="confidentialPage" :style="{ display: router.pageDisplay('confidentialPage') }">
    <button type="button" class="back btn-effect" @click="shell.goHome()">返回主畫面</button>
    <div id="confidentialTitle" class="title">{{ title }}</div>
    <div id="financeDashboard" class="finance-container" :style="view === null ? undefined : { display: 'none' }" />
    <div id="financeCalendarSection" :style="{ display: calendarSectionDisplay }">
      <div class="calendar-header d-flex justify-between items-center mb-15">
        <button type="button" class="btn-effect nav-circle-btn" @click="finance.changeMonth(-1)">◀</button>
        <h2 id="finCalendarTitle">{{ calendarTitle }}</h2>
        <button type="button" class="btn-effect nav-circle-btn" @click="finance.changeMonth(1)">▶</button>
      </div>
      <div class="finance-layout">
        <div class="calendar-container-left">
          <div class="calendar-grid-header">
            <span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span>
          </div>
          <div id="finCalendarGrid" class="calendar-grid">
            <template v-for="(cell, index) in calendarCells" :key="index">
              <div v-if="!cell" class="calendar-day empty" />
              <div
                v-else
                class="calendar-day"
                :class="{ active: cell.active }"
                :style="cell.revenue > 0 ? { backgroundColor: '#e0e7ff' } : undefined"
                @click="finance.selectDay(cell.bizDateKey)"
              >
                <div class="day-num">{{ cell.day }}</div>
                <template v-if="cell.revenue > 0">
                  <div style="font-size:12px; color:#4361ee; font-weight:bold;">{{ `$${Math.round(cell.revenue)}` }}</div>
                  <div v-if="cell.orderCount > 0" style="font-size:10px; color:#8d99ae;">{{ `(${cell.orderCount}單)` }}</div>
                </template>
              </div>
            </template>
          </div>
        </div>
        <div class="finance-summary-sidebar">
          <div class="finance-controls">
            <button type="button"
              v-for="button in rangeButtons"
              :id="button.id"
              :key="button.id"
              class="btn-effect"
              :class="{ active: activeRange === button.range }"
              @click="finance.updateStats(button.range)"
            >
              {{ button.label }}
            </button>
            <button type="button"
              id="finBtnSpecific"
              class="btn-effect"
              :class="{ active: activeRange === 'specific' }"
              :style="{ display: specificDay.visible ? 'inline-block' : 'none' }"
              @click="finance.updateStats('specific')"
            >
              {{ specificDay.bizDateKey.slice(2) }}
            </button>
          </div>
          <div
            id="customFinanceDateRange"
            class="segment-control-container"
            :style="{ display: customRangeVisible ? 'flex' : 'none' }"
          >
            <input id="financeStartDate" type="date" :value="rangeDates.start" @change="onRangeDateChange('start', $event)">
            <span>～</span>
            <input id="financeEndDate" type="date" :value="rangeDates.end" @change="onRangeDateChange('end', $event)">
          </div>
          <div class="summary-card total-theme">
            <h3 id="financeTitle">{{ summary.title }}</h3>
            <div class="sum-row"><span>總營收</span><span id="monthTotalRev">{{ summary.revenue }}</span></div>
            <div class="sum-row"><span>總成本</span><span id="monthTotalCost">{{ summary.cost }}</span></div>
            <hr>
            <div class="sum-row grand-total"><span>淨利</span><span id="monthNetProfit">{{ summary.net }}</span></div>
            <button type="button" class="btn-effect detail-btn" @click="finance.openRevenueModal('total')">查看明細</button>
          </div>
          <div id="financeCategoryCards" class="finance-category-cards">
            <div
              v-for="card in summary.categories"
              :key="card.key"
              class="summary-card finance-category-card"
              :data-category="card.key"
            >
              <h3>{{ card.title }}</h3>
              <div class="sum-row"><span>營收</span><span>{{ card.revenue }}</span></div>
              <div class="sum-row"><span>成本</span><span>{{ card.cost }}</span></div>
              <hr>
              <div class="sum-row grand-total"><span>淨利</span><span>{{ card.net }}</span></div>
              <button type="button" class="btn-effect detail-btn" @click="finance.openRevenueModal(card.key)">查看明細</button>
            </div>
          </div>
        </div>
      </div>
      <div id="financeOrderListSection" :style="{ marginTop: '20px', display: orderList.visible ? 'block' : 'none' }">
        <h3 id="financeSelectedDateTitle">{{ orderList.title }}</h3>
        <div class="history-header-row owner-grid-header">
          <span>#</span><span>桌號</span><span>內容</span><span>時間</span><span>金額</span><span>操作</span>
        </div>
        <div id="financeOrderBox">
          <div v-if="!orderList.rows" style="padding:20px; text-align:center;">無資料</div>
          <div
            v-for="(row, index) in orderList.rows || []"
            :key="index"
            class="history-row"
            style="grid-template-columns: 0.5fr 0.8fr 2fr 0.8fr 0.8fr auto !important; font-size:14px; cursor:default;"
          >
            <span class="seq" style="font-weight:bold; color:#4361ee;">{{ row.seq }}</span>
            <span class="seat">{{ row.seat }}</span>
            <span class="cust" style="color:#64748b; font-size:13px;">{{ row.summary }}</span>
            <span class="time">{{ row.time }}</span>
            <span class="amt" style="font-weight:bold; color:#ef476f;">{{ row.amount }}</span>
            <button type="button"
              class="btn-effect"
              style="padding:5px 10px; font-size:12px; background:#94a3b8; color:white; border-radius:5px;"
              @click="showReadonlyNotice"
            >
              已歸檔
            </button>
          </div>
        </div>
      </div>
    </div>
    <div id="costInputSection" class="finance-detail-box" :style="{ display: costSectionDisplay }">
      <h3 id="costEditTitle">成本 / 售價</h3>
      <div class="cost-header-row">
        <span>品項名稱</span>
        <span>售價</span>
        <span>成本</span>
      </div>
      <div id="costEditorList">
        <template v-for="category in costCategories" :key="category.key">
          <div class="cat-badge">{{ category.title }}</div>
          <div class="cost-table-container">
            <table class="cost-table">
              <thead>
                <tr>
                  <th style="width: 40%;">品項名稱</th>
                  <th style="width: 30%;">售價</th>
                  <th style="width: 30%;">成本</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in category.rows" :key="row.id">
                  <td style="font-weight: 500; color: #343a40;">{{ row.name }}</td>
                  <td>
                    <input type="number" class="cost-input" :value="row.price" @change="onItemDataChange(row.id, 'price', $event)">
                  </td>
                  <td>
                    <input
                      type="number"
                      class="cost-input"
                      :value="row.cost"
                      style="color: #e03131; font-weight:bold;"
                      @change="onItemDataChange(row.id, 'cost', $event)"
                    >
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
