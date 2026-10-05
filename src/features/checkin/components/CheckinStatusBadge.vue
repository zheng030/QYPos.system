<script setup lang="ts">
import { getStatusClass } from '../utils'

defineProps<{ status: string; label: string }>()
</script>

<template>
  <span class="checkin-badge" :class="getStatusClass(status)">{{ label }}</span>
</template>
