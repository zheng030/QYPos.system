<script setup lang="ts">
import type { AdjustedAmountDisplay } from '../runtime-support'

defineProps<{ display: AdjustedAmountDisplay; stacked?: boolean }>()
</script>

<template>
  <template v-if="!display.hasAdjustment">{{ display.finalLabel }}</template>
  <span v-else class="price-adjusted" :class="{ 'price-adjusted--stack': stacked }">
    <span class="price-adjusted-main">
      <span class="price-adjusted-original">{{ display.originalLabel }}</span>
      <span class="price-adjusted-final" :class="display.finalTone && `price-adjusted-final--${display.finalTone}`">{{ display.finalLabel }}</span>
    </span>
    <span v-if="display.noteLabel" class="price-adjusted-note">{{ display.noteLabel }}</span>
  </span>
</template>
