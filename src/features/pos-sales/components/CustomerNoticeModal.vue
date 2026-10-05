<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'

const { sales } = usePosRuntime()
const { state } = sales.customerNotice
</script>

<template>
  <div
    id="customerNoticeModal"
    class="modal customer-notice-modal"
    :class="{ 'is-loading': !state.notice }"
    :style="state.open ? { display: 'flex' } : undefined"
  >
    <div
      v-if="state.notice"
      class="modal-content modal-sheet modal-sheet-compact"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customerNoticeHeading"
    >
      <h2 id="customerNoticeHeading">{{ state.notice.title.trim() || '提示' }}</h2>
      <p v-if="state.notice.message.trim()" class="modal-copy customer-notice-message">{{ state.notice.message }}</p>
      <div class="modal-actions">
        <button type="button" class="btn-effect confirm-primary" @click="sales.customerNotice.confirm()">確認</button>
      </div>
    </div>
  </div>
</template>
