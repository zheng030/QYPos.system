<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'

import { getAuthNotice } from '../utils'
import CheckinIcon from './CheckinIcon.vue'

const { checkin } = usePosRuntime()
const { state } = checkin
const authNotice = getAuthNotice()

const FIELDS = [
  { name: 'current', placeholder: '目前密碼' },
  { name: 'next', placeholder: '新密碼' },
  { name: 'confirm', placeholder: '確認新密碼' },
] as const

function onSubmit(event: Event) {
  const form = event.target as HTMLFormElement
  const values = new FormData(form)
  void checkin.changePassword({
    current: String(values.get('current') || ''),
    next: String(values.get('next') || ''),
    confirm: String(values.get('confirm') || ''),
  })
  form.reset()
}
</script>

<template>
  <div class="checkin-section checkin-view--password">
    <div class="checkin-card">
      <div class="checkin-card__header"><CheckinIcon name="lock" /> 修改密碼</div>
      <form class="checkin-card__body checkin-form" @submit.prevent="onSubmit">
        <div v-if="authNotice" class="checkin-dev-notice">{{ authNotice }}</div>
        <div v-if="state.passwordError" class="checkin-alert checkin-alert--error">
          <CheckinIcon name="alert" :size="16" />
          <span>{{ state.passwordError }}</span>
        </div>
        <label v-for="field in FIELDS" :key="field.name" class="checkin-field">
          <span class="checkin-field__icon"><CheckinIcon name="lock" :size="16" /></span>
          <input type="password" :name="field.name" :placeholder="field.placeholder" required>
        </label>
        <button class="checkin-btn checkin-btn--primary checkin-btn--full" type="submit">確認修改</button>
      </form>
    </div>
  </div>
</template>
