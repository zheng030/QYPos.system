<script setup lang="ts">
import { computed, nextTick, reactive, shallowRef, useTemplateRef, watch } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import { UserRole } from '../constants'
import {
  buildAttendanceCalendar,
  buildWorkHoursChart,
  formatShortTime,
  getRecordLabel,
  getRecordMeta,
  getRoleLabel,
  getStatusDotClass,
  getStatusLabel,
  groupRecordsByDay,
  toDate,
} from '../utils'
import CheckinAvatar from './CheckinAvatar.vue'
import CheckinIcon from './CheckinIcon.vue'
import CheckinStatusBadge from './CheckinStatusBadge.vue'

const { checkin } = usePosRuntime()
const { state, employees, employeeList, recordList, currentUser } = checkin
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const view = computed(() => {
  const user = currentUser.value
  if (!user) return null
  const canSelect = user.role === UserRole.ADMIN
  const selectedId = canSelect ? state.dashboardEmployeeId || user.id : user.id
  const target = employees.value[selectedId] || user
  const dailyData = groupRecordsByDay(recordList.value.filter((record) => record.eid === target.id))
  const totalHours = dailyData.reduce((sum, day) => sum + day.totalHours, 0)
  return {
    canSelect,
    selectedId,
    target,
    dailyData,
    totalHours,
    avgHours: dailyData.length > 0 ? (totalHours / dailyData.length).toFixed(1) : '0.0',
    chart: buildWorkHoursChart(dailyData, state.chartMode),
  }
})

const calendar = computed(() => (view.value ? buildAttendanceCalendar(state.calendarDate, view.value.dailyData) : null))

// The 30-day chart opens scrolled to the most recent days.
const chartScroller = useTemplateRef<HTMLElement>('chartScroller')
watch(
  () => [state.chartMode, view.value?.chart] as const,
  ([chartMode]) => {
    if (chartMode !== 'month') return
    requestAnimationFrame(() => {
      if (chartScroller.value) chartScroller.value.scrollLeft = chartScroller.value.scrollWidth
    })
  },
  { flush: 'post', immediate: true }
)

const tooltip = reactive({ created: false, visible: false, date: '', hours: 0 })
const tooltipEl = shallowRef<HTMLElement | null>(null)

function placeTooltip(event: MouseEvent) {
  const element = tooltipEl.value
  if (!element || !tooltip.visible) return
  const offset = 14
  let x = event.clientX + offset
  let y = event.clientY - offset
  const rect = element.getBoundingClientRect()
  if (x + rect.width > globalThis.innerWidth) x = event.clientX - rect.width - offset
  if (y - rect.height < 0) y = event.clientY + offset
  element.style.left = `${x}px`
  element.style.top = `${y}px`
}

async function showTooltip(event: MouseEvent, bar: { date: string; hours: number }) {
  Object.assign(tooltip, { created: true, visible: true, date: bar.date, hours: bar.hours })
  await nextTick()
  placeTooltip(event)
}

function onSelectEmployee(event: Event) {
  state.dashboardEmployeeId = (event.target as HTMLSelectElement).value
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>

<template>
  <div v-if="view" class="checkin-section checkin-view--individual">
    <div class="checkin-section__header">
      <div>
        <h2 class="checkin-section__title">個人儀表板</h2>
        <p class="checkin-section__subtitle">員工個人工時分析與考勤記錄</p>
      </div>
      <div v-if="view.canSelect" class="checkin-select">
        <select :value="view.selectedId" @change="onSelectEmployee">
          <option v-for="employee in employeeList" :key="employee.id" :value="employee.id">
            {{ `${employee.name} (${getRoleLabel(employee.role)})` }}
          </option>
        </select>
        <span class="checkin-select__icon"><CheckinIcon name="chevron-down" :size="16" /></span>
      </div>
    </div>
    <div class="checkin-grid checkin-grid--individual">
      <div class="checkin-card checkin-profile">
        <div class="checkin-profile__avatar">
          <CheckinAvatar class="checkin-avatar--xl" :name="view.target.name" />
          <span class="checkin-status-dot" :class="getStatusDotClass(view.target.status)" />
        </div>
        <h3 class="checkin-section__title">{{ view.target.name }}</h3>
        <div class="checkin-tag checkin-tag--slate">{{ view.target.role === UserRole.ADMIN ? '系統管理員' : '一般員工' }}</div>
        <div class="checkin-profile__status">
          <CheckinStatusBadge :status="view.target.status" :label="getStatusLabel(view.target.status, view.target.id, recordList)" />
        </div>
        <div class="checkin-profile__meta">
          <div class="checkin-profile__row">
            <span>累積總工時</span><strong>{{ view.totalHours.toFixed(1) }} <span class="checkin-muted">hr</span></strong>
          </div>
          <div class="checkin-profile__row">
            <span>出勤天數</span><strong>{{ view.dailyData.length }} <span class="checkin-muted">天</span></strong>
          </div>
          <div class="checkin-profile__row">
            <span>平均日工時</span><strong>{{ view.avgHours }} <span class="checkin-muted">hr</span></strong>
          </div>
        </div>
      </div>
      <div class="checkin-stack">
        <div class="checkin-card">
          <div class="checkin-toolbar">
            <h3 class="checkin-card__heading"><CheckinIcon name="bar-chart" />工時趨勢分析</h3>
            <div class="checkin-toggle">
              <button type="button" :class="{ 'is-active': state.chartMode === 'week' }" @click="state.chartMode = 'week'">最近7天</button>
              <button type="button" :class="{ 'is-active': state.chartMode === 'month' }" @click="state.chartMode = 'month'">最近30天</button>
            </div>
          </div>
          <div ref="chartScroller" class="checkin-chart-scroll" :class="{ 'is-scrollable': state.chartMode === 'month' }">
            <div class="checkin-chart">
              <div
                v-for="(bar, index) in view.chart"
                :key="index"
                class="checkin-chart__bar"
                @mouseenter="showTooltip($event, bar)"
                @mousemove="placeTooltip"
                @mouseleave="tooltip.visible = false"
              >
                <div class="checkin-chart__fill" :class="{ 'is-strong': bar.hours >= 1 }" :style="{ height: `${bar.heightPercent}%` }" />
                <span>{{ bar.label }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="checkin-card">
          <div class="checkin-toolbar">
            <h3 class="checkin-card__heading">
              <CheckinIcon name="clock" />{{ state.viewMode === 'list' ? '每日考勤詳情' : '打卡日曆視圖' }}
            </h3>
            <div class="checkin-toggle">
              <button type="button" :class="{ 'is-active': state.viewMode === 'list' }" @click="state.viewMode = 'list'">
                <CheckinIcon name="list" :size="14" />列表
              </button>
              <button type="button" :class="{ 'is-active': state.viewMode === 'calendar' }" @click="state.viewMode = 'calendar'">
                <CheckinIcon name="calendar" :size="14" />日曆
              </button>
            </div>
          </div>
          <div class="checkin-gap-top">
            <template v-if="state.viewMode === 'list'">
              <div v-if="view.dailyData.length === 0" class="checkin-empty">尚無打卡記錄</div>
              <div v-else class="checkin-record-list">
                <div v-for="day in view.dailyData.slice(0, 14)" :key="day.date.getTime()" class="checkin-record-day">
                  <div class="checkin-record-day__header">
                    <div class="checkin-record-day__date">
                      <div class="checkin-date-box">
                        <span>{{ day.date.toLocaleDateString('en-US', { weekday: 'short' }) }}</span><strong>{{ day.date.getDate() }}</strong>
                      </div>
                      <div>
                        <div class="checkin-card__title">{{ formatDayLabel(day.date) }}</div>
                        <div class="checkin-card__subtitle">{{ `${day.records.length} 筆打卡紀錄` }}</div>
                      </div>
                    </div>
                    <div class="checkin-record-day__total">{{ day.totalHours }} <span class="checkin-muted">小時</span></div>
                  </div>
                  <div>
                    <div v-if="day.sessions.length === 0" class="checkin-muted">無有效工時區段</div>
                    <div v-for="(session, index) in day.sessions" :key="index" class="checkin-session">
                      <span class="checkin-session__dot" />
                      <div class="checkin-session__bar">
                        <span>{{ `${formatShortTime(session.start)} ➔ ${session.end ? formatShortTime(session.end) : '工作中...'}` }}</span>
                        <strong>{{ `${(session.duration / (1000 * 60 * 60)).toFixed(2)} h` }}</strong>
                      </div>
                    </div>
                  </div>
                  <div class="checkin-record-day__logs">
                    <div v-for="record in day.records" :key="record.id" class="checkin-record-log">
                      <span class="checkin-record-log__dot" :class="getRecordMeta(record.type).logDotClass" />
                      <span>{{ formatShortTime(toDate(record.ts)) }}</span>
                      <span :class="getRecordMeta(record.type).textClass">{{ getRecordLabel(record.type) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <div v-else-if="calendar" class="checkin-calendar">
              <div class="checkin-calendar__header">
                <button type="button" class="checkin-icon-btn" @click="checkin.shiftCalendar(-1)"><CheckinIcon name="chevron-left" /></button>
                <span class="checkin-calendar__month">{{ calendar.title }}</span>
                <button type="button" class="checkin-icon-btn" @click="checkin.shiftCalendar(1)"><CheckinIcon name="chevron-right" /></button>
              </div>
              <div class="checkin-calendar__weekdays">
                <div
                  v-for="(label, index) in weekdays"
                  :key="label"
                  :class="{ 'checkin-calendar__weekday--weekend': index === 0 || index === 6 }"
                >
                  {{ label }}
                </div>
              </div>
              <div class="checkin-calendar__grid">
                <div v-for="index in calendar.leadingBlanks" :key="`blank-${index}`" class="checkin-calendar__cell checkin-calendar__cell--empty" />
                <div
                  v-for="day in calendar.days"
                  :key="day.day"
                  class="checkin-calendar__cell"
                  :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
                >
                  <div class="checkin-calendar__date">{{ day.day }}</div>
                  <div v-if="day.hours !== null" class="checkin-calendar__hours">{{ `${day.hours}h` }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <Teleport to="body">
    <div
      v-if="tooltip.created"
      ref="tooltipEl"
      class="checkin-chart-tooltip"
      :style="{ display: tooltip.visible ? 'flex' : 'none' }"
    >
      <strong>{{ tooltip.date }}</strong><span>{{ `工時: ${tooltip.hours} 小時` }}</span>
    </div>
  </Teleport>
</template>
