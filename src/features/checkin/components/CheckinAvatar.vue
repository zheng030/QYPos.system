<script setup lang="ts">
import { computed } from 'vue'

import { getAvatarColor } from '../utils'

const props = defineProps<{ name: string }>()
const label = computed(() => props.name || '?')
</script>

<template>
  <div class="checkin-avatar" :style="{ background: getAvatarColor(label) }">{{ label.charAt(0) }}</div>
</template>
