<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import { buildAdminDashboard, formatShortTime, getRecordLabel, getRecordMeta, toDate } from '../utils'
import CheckinAvatar from './CheckinAvatar.vue'
import CheckinIcon from './CheckinIcon.vue'

const { checkin } = usePosRuntime()
const { employees, employeeList, recordList } = checkin

const dashboard = computed(() => buildAdminDashboard(employeeList.value, recordList.value))
</script>

<template>
  <div class="checkin-section checkin-view--dashboard">
    <div class="checkin-section__header">
      <div>
        <h2 class="checkin-section__title">管理儀表板</h2>
        <p class="checkin-section__subtitle">即時監控公司出勤狀況與數據概覽</p>
      </div>
    </div>
    <div v-for="(cards, index) in [dashboard.statCards, dashboard.statusCards]" :key="index" class="checkin-grid" :class="index === 0 ? 'checkin-grid--stats' : 'checkin-grid--status'">
      <div v-for="card in cards" :key="card.label" class="checkin-card">
        <div class="checkin-stat-card">
          <div>
            <div class="checkin-stat__label">{{ card.label }}</div>
            <div class="checkin-stat__value">{{ card.value }}</div>
          </div>
          <div class="checkin-stat__icon" :class="`checkin-stat__icon--${card.variant}`">
            <CheckinIcon :name="card.icon" />
          </div>
        </div>
      </div>
    </div>
    <div class="checkin-card checkin-card--table">
      <div class="checkin-card__header">最新打卡記錄</div>
      <div class="checkin-table-wrap">
        <table class="checkin-table">
          <thead>
            <tr><th>員工</th><th>類型</th><th>時間</th></tr>
          </thead>
          <tbody>
            <tr v-for="record in dashboard.recent" :key="record.id">
              <td>
                <div class="checkin-inline">
                  <CheckinAvatar class="checkin-avatar--xs" :name="employees[record.eid]?.name || 'U'" />
                  <span>{{ employees[record.eid]?.name || 'Unknown' }}</span>
                </div>
              </td>
              <td><span :class="getRecordMeta(record.type).tagClass">{{ getRecordLabel(record.type) }}</span></td>
              <td>{{ formatShortTime(toDate(record.ts)) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
