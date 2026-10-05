<script setup lang="ts">
import QRCode from 'qrcode'
import { useTemplateRef, watchPostEffect } from 'vue'

const props = defineProps<{ text: string; size: number }>()
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

watchPostEffect(() => {
  if (canvas.value) {
    void QRCode.toCanvas(canvas.value, props.text, { margin: 1, width: props.size })
  }
})
</script>

<template>
  <canvas ref="canvas" />
</template>
