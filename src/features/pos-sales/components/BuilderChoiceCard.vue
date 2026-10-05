<script setup lang="ts">
import type { BuilderOptionView } from '../builder'
import { formatCurrency } from '../runtime-utils'

defineProps<{
  groupId: string
  label: string
  required: boolean
  missing: boolean
  issueGroupId: string | null
  options?: BuilderOptionView[]
  text?: { value: string; placeholder?: string }
}>()

const emit = defineEmits<{ select: [value: string]; input: [value: string] }>()

function onInput(event: Event) {
  emit('input', (event.target as HTMLInputElement).value)
}
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
    <input
      v-if="text"
      class="builder-input"
      type="text"
      :value="text.value"
      :placeholder="text.placeholder || '請輸入'"
      @input="onInput"
    >
    <div v-else class="builder-option-grid">
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
