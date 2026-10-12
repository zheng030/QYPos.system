<script setup lang="ts">
import ReceiptView from './ReceiptView.vue'
import type { ReceiptPrinter } from './receipt-printer'

defineProps<{ printer: ReceiptPrinter }>()
</script>

<template>
  <div
    id="receipt-print-area"
    :class="printer.job.value ? 'print-area-active' : 'print-area-hidden'"
  >
    <ReceiptView
      v-if="printer.job.value"
      :data="printer.job.value.data"
      :is-ticket="printer.job.value.isTicket"
    />
  </div>
</template>
