<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import { AttendanceType, EmployeeStatus } from '../constants'
import {
  calculateWorkHours,
  formatDate,
  formatShortTime,
  formatTime,
  getRecordLabel,
  getRecordMeta,
  getStatusLabel,
  getUserRecords,
  toDate,
} from '../utils'
import CheckinIcon from './CheckinIcon.vue'
import CheckinStatusBadge from './CheckinStatusBadge.vue'
import { useNow } from './use-now'

const { checkin } = usePosRuntime()
const { currentUser, recordList } = checkin
const now = useNow()

// Work hours are a snapshot taken whenever the records or the user change, not a live counter.
const view = computed(() => {
  const user = currentUser.value
  if (!user) return null
  const renderedAt = new Date()
  const { todayRecords, weeklyRecords } = getUserRecords(recordList.value, user.id)
  return {
    user,
    renderedAt,
    dailyHours: calculateWorkHours(todayRecords, renderedAt),
    weeklyHours: calculateWorkHours(weeklyRecords, renderedAt),
    statusLabel: getStatusLabel(user.status, user.id, recordList.value),
    timeline: [...todayRecords].sort((left, right) => (toDate(left.ts)?.getTime() || 0) - (toDate(right.ts)?.getTime() || 0)),
  }
})
</script>

<template>
  <div v-if="view" class="checkin-section checkin-view--clock">
    <div class="checkin-section__header">
      <div>
        <h1 class="checkin-section__title">早安，{{ view.user.name }} 👋</h1>
        <p class="checkin-section__subtitle checkin-inline"><CheckinIcon name="calendar" :size="16" />{{ formatDate(view.renderedAt) }}</p>
      </div>
    </div>
    <div class="checkin-grid checkin-grid--clock">
      <div class="checkin-stack">
        <div class="checkin-card checkin-card--clock">
          <div class="checkin-status-row">
            <CheckinStatusBadge :status="view.user.status" :label="`目前狀態：${view.statusLabel}`" />
          </div>
          <div class="checkin-time" data-role="checkin-time">{{ formatTime(now) }}</div>
          <div class="checkin-date" data-role="checkin-date">{{ formatDate(now) }}</div>
          <div class="checkin-actions">
            <button type="button"
              v-if="view.user.status === EmployeeStatus.OFF_DUTY"
              class="checkin-btn checkin-btn--primary checkin-btn--xl checkin-btn--span"
              @click="checkin.clockAction(AttendanceType.CLOCK_IN)"
            >
              <CheckinIcon name="play" /> 上班打卡
            </button>
            <template v-else>
              <button type="button"
                v-if="view.user.status === EmployeeStatus.WORKING"
                class="checkin-btn checkin-btn--orange checkin-btn--xl"
                @click="checkin.clockAction(AttendanceType.BREAK_START)"
              >
                <CheckinIcon name="coffee" /> 開始休息
              </button>
              <button type="button"
                v-else
                class="checkin-btn checkin-btn--green checkin-btn--xl"
                @click="checkin.clockAction(AttendanceType.BREAK_END)"
              >
                <CheckinIcon name="briefcase" /> 結束休息
              </button>
              <button type="button" class="checkin-btn checkin-btn--dark checkin-btn--xl" @click="checkin.clockAction(AttendanceType.CLOCK_OUT)">
                <CheckinIcon name="square" :size="16" /> 下班打卡
              </button>
            </template>
          </div>
        </div>
        <div class="checkin-grid checkin-grid--stats">
          <div class="checkin-card">
            <div class="checkin-stat-card">
              <div>
                <div class="checkin-stat__label checkin-text--brand">本日工時</div>
                <div class="checkin-stat__value">{{ view.dailyHours }} <span>小時</span></div>
              </div>
              <div class="checkin-stat__icon checkin-stat__icon--blue"><CheckinIcon name="clock" /></div>
            </div>
          </div>
          <div class="checkin-card">
            <div class="checkin-stat-card">
              <div>
                <div class="checkin-stat__label checkin-text--purple">本週工時</div>
                <div class="checkin-stat__value">{{ view.weeklyHours }} <span>小時</span></div>
              </div>
              <div class="checkin-stat__icon checkin-stat__icon--purple"><CheckinIcon name="calendar" /></div>
            </div>
          </div>
        </div>
      </div>
      <div class="checkin-card checkin-card--timeline">
        <h3 class="checkin-card__heading"><span class="checkin-card__accent" />今日打卡記錄</h3>
        <div v-if="view.timeline.length === 0" class="checkin-empty">
          <CheckinIcon name="clock" :size="28" />
          <div>尚無今日打卡記錄</div>
          <div class="checkin-muted">開始您的一天吧！</div>
        </div>
        <template v-else>
          <div class="checkin-timeline">
            <div v-for="record in view.timeline" :key="record.id" class="checkin-timeline__item">
              <span :class="getRecordMeta(record.type).dotClass" />
              <div class="checkin-timeline__card">
                <div class="checkin-timeline__row">
                  <span class="checkin-timeline__title" :class="getRecordMeta(record.type).textClass">{{ getRecordLabel(record.type) }}</span>
                  <span class="checkin-timeline__time">{{ formatShortTime(toDate(record.ts)) }}</span>
                </div>
              </div>
            </div>
          </div>
          <div v-if="view.user.status !== EmployeeStatus.OFF_DUTY" class="checkin-timeline__active">
            {{ view.user.status === EmployeeStatus.WORKING ? '工作中...' : '休息中...' }}
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
