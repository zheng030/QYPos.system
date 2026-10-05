<script setup lang="ts">
import { useImagePreview } from './image-preview'

const preview = useImagePreview()
</script>

<template>
  <div id="imagePreviewHost">
    <div
      v-if="preview.current.value"
      class="image-preview-backdrop show"
      role="dialog"
      aria-modal="true"
      :aria-label="`${preview.current.value.alt}大圖`"
      @click.self="preview.close()"
    >
      <div class="image-preview-sheet">
        <button class="image-preview-close btn-effect" type="button" aria-label="關閉圖片" @click="preview.close()">
          ×
        </button>
        <img :src="preview.current.value.url" :alt="preview.current.value.alt">
      </div>
    </div>
  </div>
</template>
