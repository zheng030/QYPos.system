<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import { UserRole } from '../constants'
import { getStatusDotVariant, getStatusLabel } from '../utils'
import CheckinAvatar from './CheckinAvatar.vue'
import CheckinIcon from './CheckinIcon.vue'

const { checkin } = usePosRuntime()
const { state, employeeList, recordList } = checkin

const filteredEmployees = computed(() => {
  const search = state.employeeSearch.trim().toLowerCase()
  return employeeList.value.filter((employee) => employee.name.toLowerCase().includes(search))
})
</script>

<template>
  <div class="checkin-section checkin-view--employees">
    <div class="checkin-section__header">
      <div>
        <h2 class="checkin-section__title">員工管理</h2>
        <p class="checkin-section__subtitle">管理公司成員與角色權限</p>
      </div>
      <button type="button" class="checkin-btn checkin-btn--primary" @click="checkin.openModal({ type: 'addEmployee' })">
        <CheckinIcon name="plus" /> 新增員工
      </button>
    </div>
    <div class="checkin-card checkin-card--table">
      <div class="checkin-toolbar">
        <div class="checkin-search">
          <span><CheckinIcon name="search" :size="16" /></span>
          <input v-model="state.employeeSearch" type="text" placeholder="搜尋員工姓名...">
        </div>
      </div>
      <div class="checkin-table-wrap">
        <table class="checkin-table">
          <thead>
            <tr>
              <th>員工資訊</th>
              <th>權限角色</th>
              <th>狀態</th>
              <th class="checkin-text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="employee in filteredEmployees" :key="employee.id">
              <td>
                <div class="checkin-inline">
                  <CheckinAvatar class="checkin-avatar--sm" :name="employee.name" />
                  <div>
                    <div class="checkin-card__title">{{ employee.name }}</div>
                    <div class="checkin-card__subtitle">ID: {{ employee.id }}</div>
                  </div>
                </div>
              </td>
              <td>
                <span v-if="employee.role === UserRole.ADMIN" class="checkin-tag checkin-tag--green">系統管理員</span>
                <span v-else class="checkin-tag checkin-tag--brand">一般員工</span>
              </td>
              <td>
                <div class="checkin-inline">
                  <span class="checkin-record-log__dot" :class="getStatusDotVariant(employee.status)" />
                  <span>{{ getStatusLabel(employee.status, employee.id, recordList) }}</span>
                </div>
              </td>
              <td>
                <div class="checkin-table__actions">
                  <button type="button" class="checkin-icon-btn" title="編輯" @click="checkin.openModal({ type: 'editEmployee', empId: employee.id })">
                    <CheckinIcon name="edit" :size="16" />
                  </button>
                  <button type="button" class="checkin-icon-btn checkin-icon-btn--danger" title="刪除" @click="checkin.deleteEmployee(employee.id)">
                    <CheckinIcon name="trash" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="filteredEmployees.length === 0" class="checkin-empty">尚無員工資料</div>
    </div>
  </div>
</template>
