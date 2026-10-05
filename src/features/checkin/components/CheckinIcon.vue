<script setup lang="ts">
import { type CheckinIconName, ICONS } from '../constants'

withDefaults(defineProps<{ name: CheckinIconName; size?: number }>(), { size: 18 })
</script>

<!-- Icon markup is static, trusted SVG from ICONS. -->
<template>
  <svg
    class="checkin-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    v-html="ICONS[name]"
  />
</template>
