<script setup lang="ts">
import type { ToastService } from './toast'

defineProps<{ toast: ToastService }>()
</script>

<template>
  <div id="toast-container">
    <div v-for="item in toast.items" :key="item.key" class="toast-item" :class="{ show: item.shown }">
      <span>{{ item.text }}</span>
      <span v-if="item.count > 1" class="toast-count">{{ ` x${item.count}` }}</span>
    </div>
  </div>
</template>

<style scoped>
.toast-count {
  color: #ef476f;
  font-weight: bold;
  margin-left: 6px;
}
</style>
