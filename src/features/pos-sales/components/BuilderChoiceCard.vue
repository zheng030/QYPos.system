<script setup lang="ts">
import type { BuilderOptionView } from '../builder'
import { formatCurrency } from '../runtime-utils'

defineProps<{
  groupId: string
  label: string
  required: boolean
  missing: boolean
  issueGroupId: string | null
  options: BuilderOptionView[]
}>()

const emit = defineEmits<{ select: [value: string] }>()
</script>

<template>
  <div
    class="builder-rule-card"
    :class="{ missing, 'issue-target': issueGroupId === groupId }"
    :data-builder-group="groupId"
  >
    <div class="builder-rule-head">
      <strong>{{ label }}<span v-if="required" class="builder-required">必填</span></strong>
    </div>
    <div class="builder-option-grid">
      <button type="button"
        v-for="option in options"
        :key="option.value"
        class="builder-option-btn btn-effect"
        :class="{ active: option.selected }"
        :disabled="option.disabled"
        @click="emit('select', option.value)"
      >
        {{ `${option.label}${option.priceDelta ? ` +${formatCurrency(option.priceDelta)}` : ''}` }}
      </button>
    </div>
  </div>
</template>
