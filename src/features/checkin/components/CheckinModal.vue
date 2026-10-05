<script setup lang="ts">
import { reactive } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import { AttendanceType, UserRole } from '../constants'
import type { CheckinModalState } from '../types'
import { formatDateInput } from '../utils'
import CheckinIcon from './CheckinIcon.vue'

const props = defineProps<{ modal: NonNullable<CheckinModalState> }>()

const { checkin } = usePosRuntime()
const { state, employees, records } = checkin

// The modal starts from a snapshot taken when it opens, so live data updates never reset what the user typed.
const employee = props.modal.type === 'editEmployee' ? employees.value[props.modal.empId] : undefined
const record = props.modal.type === 'editRecord' ? records.value[props.modal.recordId] : undefined
const employeeForm = reactive({ name: employee?.name || '', role: employee?.role || UserRole.EMPLOYEE, password: '' })
const recordForm = reactive({
  type: record?.type || AttendanceType.CLOCK_IN,
  ts: record ? formatDateInput(record.ts) : '',
  notes: record?.notes || '',
})

const ROLE_OPTIONS = [
  { value: UserRole.EMPLOYEE, label: '一般員工' },
  { value: UserRole.ADMIN, label: '管理員' },
]

const TYPE_OPTIONS = [
  { value: AttendanceType.CLOCK_IN, label: '上班' },
  { value: AttendanceType.CLOCK_OUT, label: '下班' },
  { value: AttendanceType.BREAK_START, label: '休息' },
  { value: AttendanceType.BREAK_END, label: '結束休息' },
]

const TITLES = { addEmployee: '新增員工', editEmployee: '編輯員工', editRecord: '編輯打卡記錄' }

function onSubmit() {
  if (employee) {
    void checkin.saveEmployeeEdit(employee.id, { ...employeeForm })
  } else if (record) {
    void checkin.saveRecord(record.id, { ...recordForm })
  } else {
    void checkin.addEmployee({ ...employeeForm })
  }
}

function close() {
  state.modal = null
}
</script>

<template>
  <div v-if="modal.type === 'addEmployee' || employee || record" class="checkin-modal">
    <div class="checkin-modal__content">
      <div class="checkin-modal__header">
        <h3>{{ TITLES[modal.type] }}</h3>
        <button type="button" class="checkin-icon-btn" @click="close"><CheckinIcon name="close" /></button>
      </div>
      <form class="checkin-modal__body checkin-form" @submit.prevent="onSubmit">
        <template v-if="record">
          <label>
            <span class="checkin-card__subtitle">類型</span>
            <select v-model="recordForm.type" name="type">
              <option v-for="option in TYPE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>
            <span class="checkin-card__subtitle">時間</span>
            <input v-model="recordForm.ts" type="datetime-local" name="ts" required>
          </label>
          <label>
            <span class="checkin-card__subtitle">備註</span>
            <input v-model="recordForm.notes" type="text" name="notes" placeholder="備註">
          </label>
        </template>
        <template v-else>
          <label>
            <span class="checkin-card__subtitle">姓名</span>
            <input v-model="employeeForm.name" type="text" name="name" placeholder="姓名" required>
          </label>
          <label v-if="!employee">
            <span class="checkin-card__subtitle">密碼</span>
            <input v-model="employeeForm.password" type="password" name="password" placeholder="密碼" required>
          </label>
          <label>
            <span class="checkin-card__subtitle">角色</span>
            <select v-model="employeeForm.role" name="role">
              <option v-for="option in ROLE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label v-if="employee">
            <span class="checkin-card__subtitle">新密碼（留空不變）</span>
            <input v-model="employeeForm.password" type="password" name="password" placeholder="新密碼">
          </label>
        </template>
        <div class="checkin-modal__footer">
          <button type="button" class="checkin-btn checkin-btn--outline" @click="close">取消</button>
          <button type="submit" class="checkin-btn checkin-btn--primary">{{ modal.type === 'addEmployee' ? '建立' : '儲存' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
