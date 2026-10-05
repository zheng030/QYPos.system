<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import CheckinAdminDashboard from './CheckinAdminDashboard.vue'
import CheckinClockView from './CheckinClockView.vue'
import CheckinEmployees from './CheckinEmployees.vue'
import CheckinHeader from './CheckinHeader.vue'
import CheckinIndividualDashboard from './CheckinIndividualDashboard.vue'
import CheckinLogin from './CheckinLogin.vue'
import CheckinModal from './CheckinModal.vue'
import CheckinPassword from './CheckinPassword.vue'
import CheckinReports from './CheckinReports.vue'

const { router, checkin } = usePosRuntime()
const { state } = checkin

const VIEWS = {
  clock: CheckinClockView,
  dashboard: CheckinAdminDashboard,
  individual: CheckinIndividualDashboard,
  reports: CheckinReports,
  employees: CheckinEmployees,
  password: CheckinPassword,
}

const modalKey = computed(() => JSON.stringify(state.modal))
</script>

<template>
  <div id="checkinPage" class="checkin-page" :style="{ display: router.pageDisplay('checkinPage') }">
    <div class="checkin-shell">
      <button type="button" class="back btn-effect checkin-back-btn" @click="checkin.leave()">⬅ 返回主畫面</button>
    </div>
    <div id="checkin-root">
      <div v-if="state.loading" class="checkin-loading">載入中...</div>
      <CheckinLogin v-else-if="!state.currentUserId" />
      <template v-else>
        <CheckinHeader />
        <div class="checkin-content">
          <component :is="VIEWS[state.currentView]" />
        </div>
        <CheckinModal v-if="state.modal" :key="modalKey" :modal="state.modal" />
      </template>
    </div>
  </div>
</template>
