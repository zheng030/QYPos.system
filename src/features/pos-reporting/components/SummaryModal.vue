<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'

const { reporting } = usePosRuntime()
const { summaryModal } = reporting
</script>

<template>
  <div id="summaryModal" class="modal" :style="summaryModal.open ? { display: 'flex' } : undefined">
    <div class="modal-content">
      <h2>本日營業結算</h2>
      <div class="summary-item"><span>總訂單數</span><span id="sumCount">{{ `${summaryModal.count} 單` }}</span></div>
      <div class="summary-item"><span>營業總額</span><span id="sumTotal">{{ `$${Math.round(summaryModal.total || 0)}` }}</span></div>
      <hr>
      <div class="modal-actions">
        <button type="button" class="btn-effect cancel" @click="reporting.closeSummaryModal()">取消</button>
        <button type="button" class="btn-effect confirm-success" @click="reporting.confirmCloseBusiness()">確認</button>
      </div>
    </div>
  </div>
</template>
