<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import { AttendanceType } from '../constants'
import { formatBusinessDateOnly, formatShortTime, getRecordLabel, getRecordMeta, toDate } from '../utils'
import CheckinAvatar from './CheckinAvatar.vue'
import CheckinIcon from './CheckinIcon.vue'

const { checkin } = usePosRuntime()
const { state, employees, employeeList, currentUser, isAdmin } = checkin

const TYPE_OPTIONS = [
  { value: 'all', label: '所有類型' },
  { value: AttendanceType.CLOCK_IN, label: '上班' },
  { value: AttendanceType.CLOCK_OUT, label: '下班' },
  { value: AttendanceType.BREAK_START, label: '休息' },
  { value: AttendanceType.BREAK_END, label: '結束休息' },
]

const rows = computed(() =>
  checkin
    .filterReportRecords(isAdmin.value ? state.reportEmployeeId : currentUser.value?.id || '')
    .map((record) => ({ record, date: toDate(record.ts), employeeName: employees.value[record.eid]?.name }))
)
</script>

<template>
  <div class="checkin-section checkin-view--reports">
    <div class="checkin-section__header">
      <div>
        <h2 class="checkin-section__title">考勤明細報表</h2>
        <p class="checkin-section__subtitle">{{ isAdmin ? '查看所有員工的詳細打卡歷史記錄' : '查看您的個人打卡歷史記錄' }}</p>
      </div>
      <button type="button" v-if="isAdmin" class="checkin-btn checkin-btn--outline" @click="checkin.exportCsv()">
        <CheckinIcon name="download" :size="16" /> 匯出 CSV
      </button>
    </div>
    <div class="checkin-card checkin-card--table">
      <div class="checkin-filter">
        <div class="checkin-filter__label"><CheckinIcon name="filter" :size="14" /> 篩選條件</div>
        <select v-if="isAdmin" v-model="state.reportEmployeeId">
          <option value="all">所有員工</option>
          <option v-for="employee in employeeList" :key="employee.id" :value="employee.id">{{ employee.name }}</option>
        </select>
        <select v-model="state.reportFilterType">
          <option v-for="option in TYPE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <div class="checkin-filter__count">共找到 {{ rows.length }} 筆記錄</div>
      </div>
      <div class="checkin-table-wrap">
        <table class="checkin-table">
          <thead>
            <tr>
              <th>員工</th>
              <th>日期</th>
              <th>時間</th>
              <th>打卡類型</th>
              <th>備註</th>
              <th v-if="isAdmin" class="checkin-text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="{ record, date, employeeName } in rows" :key="record.id">
              <td>
                <div class="checkin-inline">
                  <CheckinAvatar class="checkin-avatar--xs" :name="employeeName || 'U'" />
                  <span>{{ employeeName || 'Unknown' }}</span>
                </div>
              </td>
              <td>{{ date ? formatBusinessDateOnly(date) : '-' }}</td>
              <td>{{ date ? formatShortTime(date) : '-' }}</td>
              <td><span :class="getRecordMeta(record.type).tagClass">{{ getRecordLabel(record.type) }}</span></td>
              <td>{{ record.notes || '-' }}</td>
              <td v-if="isAdmin" class="checkin-text-right">
                <div class="checkin-table__actions">
                  <button type="button" class="checkin-icon-btn" title="編輯" @click="checkin.openModal({ type: 'editRecord', recordId: record.id })">
                    <CheckinIcon name="edit" :size="16" />
                  </button>
                  <button type="button" class="checkin-icon-btn checkin-icon-btn--danger" title="刪除 (無法復原)" @click="checkin.deleteRecord(record.id)">
                    <CheckinIcon name="trash" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="rows.length === 0" class="checkin-empty">尚無符合條件的記錄</div>
    </div>
  </div>
</template>
