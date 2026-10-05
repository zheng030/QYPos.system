<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import { getAuthNotice, getRoleLabel } from '../utils'
import CheckinAvatar from './CheckinAvatar.vue'
import CheckinIcon from './CheckinIcon.vue'

const { checkin } = usePosRuntime()
const { state, employees, employeeList } = checkin
const authNotice = getAuthNotice()

const selectedName = computed(() => (state.loginEmployeeId ? employees.value[state.loginEmployeeId]?.name || '' : ''))

function onSubmit(event: Event) {
  const form = event.target as HTMLFormElement
  void checkin.login(String(new FormData(form).get('password') || ''))
  form.reset()
}
</script>

<template>
  <div v-if="!state.loginEmployeeId" class="checkin-login checkin-login--select">
    <div class="checkin-login__intro">
      <h1 class="checkin-title">歡迎使用打卡系統</h1>
      <p class="checkin-muted">請選擇您的身份以繼續</p>
      <p v-if="authNotice" class="checkin-dev-notice">{{ authNotice }}</p>
    </div>
    <div class="checkin-grid checkin-grid--cards">
      <button type="button"
        v-for="employee in employeeList"
        :key="employee.id"
        class="checkin-card checkin-card--select"
        @click="checkin.selectLoginEmployee(employee.id)"
      >
        <CheckinAvatar class="checkin-avatar--lg" :name="employee.name" />
        <div>
          <div class="checkin-card__title">{{ employee.name }}</div>
          <div class="checkin-card__subtitle">{{ getRoleLabel(employee.role) }}</div>
        </div>
      </button>
    </div>
  </div>
  <div v-else class="checkin-login">
    <div class="checkin-card checkin-card--login">
      <button type="button" class="checkin-link checkin-link--back" @click="checkin.selectLoginEmployee(null)">
        <CheckinIcon name="arrow-left" :size="16" /> 返回選擇使用者
      </button>
      <div class="checkin-login__profile">
        <CheckinAvatar class="checkin-avatar--xl" :name="selectedName" />
        <h2 class="checkin-title">早安，{{ selectedName }}</h2>
        <p class="checkin-muted">請輸入密碼以登入系統</p>
        <p v-if="authNotice" class="checkin-dev-notice">{{ authNotice }}</p>
      </div>
      <form class="checkin-form" @submit.prevent="onSubmit">
        <label class="checkin-field">
          <span class="checkin-field__icon"><CheckinIcon name="lock" /></span>
          <input type="password" name="password" placeholder="請輸入密碼" required>
        </label>
        <div v-if="state.loginError" class="checkin-alert checkin-alert--error">
          <CheckinIcon name="alert" :size="16" />
          <span>{{ state.loginError }}</span>
        </div>
        <button class="checkin-btn checkin-btn--primary checkin-btn--full" type="submit">
          登入系統 <CheckinIcon name="arrow-right" :size="16" />
        </button>
      </form>
    </div>
  </div>
</template>
