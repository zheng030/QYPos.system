<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'
import { POS_CATEGORY_LABELS } from '@/features/pos-kernel/types'

import { formatSignedCurrency } from '../owner-finance'

const { admin } = usePosRuntime()
const finance = admin.finance
const { revenueModal } = finance
</script>

<template>
  <div id="revenueDetailModal" class="modal" :style="revenueModal.open ? { display: 'flex' } : undefined">
    <div class="modal-content modal-sheet modal-sheet-compact modal-scroll-frame">
      <div class="modal-header"><h2 id="revenueDetailTitle">{{ revenueModal.title }}</h2></div>
      <div id="revenueDetailList" class="modal-body modal-list-body detail-list">
        <div v-if="revenueModal.items.length === 0" class="empty-hint">目前區間沒有資料</div>
        <template v-for="(item, index) in revenueModal.items" :key="index">
          <div v-if="revenueModal.bucket === 'extra' || typeof item.amount === 'number'" class="detail-item-row">
            <span class="detail-price">{{ `#${item.seq || ''}` }}</span>
            <div class="detail-name">{{ item.categoryLabel || POS_CATEGORY_LABELS.extra }}</div>
            <div class="detail-info">
              <span class="detail-price">{{ formatSignedCurrency(item.amount || 0) }}</span>
              <span class="detail-time">{{ item.time || '' }}</span>
            </div>
          </div>
          <div v-else class="detail-item-row">
            <span class="detail-price">{{ `#${item.seq || ''}` }}</span>
            <div class="detail-name">{{ `${item.name || ''}${item.qty && item.qty > 1 ? ` x${item.qty}` : ''}` }}</div>
            <div class="detail-info">
              <span class="detail-price">{{ formatSignedCurrency(item.price || 0) }}</span>
              <span v-if="typeof item.cost === 'number'" class="detail-price" style="color:#ef476f;">
                {{ `成本 ${formatSignedCurrency(item.cost)}` }}
              </span>
              <span class="detail-time">{{ item.time || '' }}</span>
            </div>
          </div>
        </template>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-effect cancel" @click="finance.closeRevenueModal()">關閉</button>
      </div>
    </div>
  </div>
</template>
