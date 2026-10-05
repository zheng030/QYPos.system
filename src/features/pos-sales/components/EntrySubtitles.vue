<script setup lang="ts">
export type SubtitleLine = { text: string | undefined; className?: string }

defineProps<{ lines: SubtitleLine[] }>()
</script>

<template>
  <template v-for="(line, index) in lines" :key="index">
    <div v-if="line.text" class="entry-card-subtitle" :class="line.className">{{ line.text }}</div>
  </template>
</template>
