<script setup lang="ts">
import { computed } from 'vue'

import type { PosMenuItem } from '@/features/pos-kernel/types'
import { useImagePreview } from '@/shared/ui/image-preview'

import { getItemImageAlt, resolvePublicAssetUrl } from '../runtime-utils'

const props = defineProps<{ item: PosMenuItem | null | undefined }>()
const preview = useImagePreview()

const image = computed(() => {
  const item = props.item
  if (!item?.imageUrl) return null
  return {
    url: resolvePublicAssetUrl(item.imageUrl),
    alt: getItemImageAlt(item),
    style: item.imageObjectPosition ? { objectPosition: item.imageObjectPosition } : undefined,
  }
})
</script>

<template>
  <button
    v-if="image"
    class="menu-image-button"
    type="button"
    :aria-label="`查看${image.alt}大圖`"
    @click.prevent.stop="preview.open(image.url, image.alt)"
  >
    <img :src="image.url" :alt="image.alt" loading="lazy" :style="image.style">
  </button>
</template>
