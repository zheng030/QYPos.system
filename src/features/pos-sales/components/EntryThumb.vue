<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'
import type { PosOrderEntry } from '@/features/pos-kernel/types'

import { getEntryMenuItem } from '../runtime-utils'
import ItemImageButton from './ItemImageButton.vue'

defineProps<{ entry: PosOrderEntry }>()
const { kernel } = usePosRuntime()
</script>

<template>
  <ItemImageButton :item="getEntryMenuItem(entry, kernel.helpers.getItemById)" />
</template>
