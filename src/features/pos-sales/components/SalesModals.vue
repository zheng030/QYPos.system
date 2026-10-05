<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'
import QrCodeCanvas from '@/shared/ui/QrCodeCanvas.vue'

import { getEntryAdjustedAmountDisplay } from '../runtime-support'
import { formatCurrency } from '../runtime-utils'
import AdjustedAmount from './AdjustedAmount.vue'
import EntrySubtitles from './EntrySubtitles.vue'
import EntryThumb from './EntryThumb.vue'
import SplitEntryList from './SplitEntryList.vue'

const { kernel, sales, bell } = usePosRuntime()
const { playing: bellPlaying, blocked: bellBlocked, enabled: bellEnabled } = bell
const {
  confirmDialog,
  paymentModal,
  splitModal,
  splitEntries,
  reprintModal,
  discountModal,
  discountPreview,
  qrModal,
  pendingOverlay,
} = sales

function shown(open: boolean) {
  return open ? { display: 'flex' } : undefined
}

function inputValue(event: Event) {
  return (event.target as HTMLInputElement).value
}

function inputChecked(event: Event) {
  return (event.target as HTMLInputElement).checked
}
</script>

<template>
  <div id="orderActionConfirmModal" class="modal" :style="shown(confirmDialog.open)">
    <div class="modal-content modal-sheet modal-sheet-compact">
      <h2 id="orderActionConfirmTitle">{{ confirmDialog.title }}</h2>
      <p id="orderActionConfirmMessage" class="modal-copy">{{ confirmDialog.message }}</p>
      <div class="modal-actions">
        <button type="button" class="btn-effect cancel" @click="sales.closeConfirm()">取消</button>
        <button type="button" id="orderActionConfirmBtn" class="btn-effect confirm-primary" @click="sales.runConfirmedAction()">
          {{ confirmDialog.confirmText }}
        </button>
      </div>
    </div>
  </div>

  <div id="paymentModal" class="modal" :style="shown(paymentModal.open)">
    <div class="modal-content modal-sheet modal-sheet-compact">
      <h2>結帳確認</h2>
      <div class="payment-info">
        <div class="pay-row">
          <span>應收金額 <small id="payDiscLabel">{{ paymentModal.discountLabel }}</small></span>
          <span id="payOriginal">{{ formatCurrency(paymentModal.original) }}</span>
        </div>
        <div
          id="payDiscountRow"
          class="pay-row"
          :style="{ display: paymentModal.discountPercent > 0 ? 'flex' : 'none' }"
        >
          <span>折數</span>
          <span id="payDiscountValue">{{ paymentModal.discountPercent > 0 ? `${paymentModal.discountPercent}%` : '無' }}</span>
        </div>
        <div class="pay-row">
          <span>收 10% 服務費</span>
          <input
            id="payServiceFee"
            type="checkbox"
            :checked="paymentModal.serviceFee"
            @input="sales.recalcPayment({ serviceFee: inputChecked($event) })"
          >
        </div>
        <div class="pay-row">
          <span>折讓</span>
          <input
            id="payAllowance"
            type="number"
            :value="paymentModal.allowance"
            @input="sales.recalcPayment({ allowance: inputValue($event) })"
          >
        </div>
        <hr>
        <div class="pay-row large">
          <span>實收金額</span>
          <input id="payFinal" type="number" :value="paymentModal.final" @input="paymentModal.final = inputValue($event)">
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-effect cancel" @click="sales.closePaymentModal()">取消</button>
        <button type="button" class="btn-effect confirm-success" @click="sales.checkoutAll()">確認收款</button>
      </div>
    </div>
  </div>

  <div id="checkoutModal" class="modal" :style="shown(splitModal.open)">
    <div class="modal-content modal-sheet modal-sheet-wide split-modal">
      <div class="modal-header"><h2>拆單結帳</h2></div>
      <div class="modal-body">
        <div class="split-checkout-container">
          <div class="checkout-box">
            <div class="box-header"><div class="box-title">未結帳品項</div></div>
            <div id="unpaidList" class="checkout-list modern-list">
              <SplitEntryList :entries="splitEntries.unpaid" :selected="false" empty-text="目前沒有未結帳品項" />
            </div>
          </div>
          <div class="checkout-box emphasis">
            <div class="box-header"><div class="box-title">本次結帳</div></div>
            <div id="payingList" class="checkout-list modern-list">
              <SplitEntryList :entries="splitEntries.selected" :selected="true" empty-text="尚未選擇本次結帳品項" />
            </div>
            <div class="split-options">
              <label class="field"><span>折數 (%)</span><input id="splitDisc" type="number" :value="splitModal.discount" @input="splitModal.discount = inputValue($event)"></label>
              <label class="field"><span>收 10% 服務費</span><input id="splitServiceFee" v-model="splitModal.serviceFee" type="checkbox"></label>
              <label class="field"><span>$ 折讓</span><input id="splitAllow" type="number" :value="splitModal.allowance" @input="splitModal.allowance = inputValue($event)"></label>
            </div>
            <div class="checkout-total">
              <div class="total-label">應收</div>
              <div id="payTotal" class="total-amount">{{ formatCurrency(splitEntries.finalTotal) }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-effect cancel" @click="sales.closeSplitCheckoutModal()">取消</button>
        <button type="button" class="btn-effect confirm-success" @click="sales.checkoutSplitSelection()">確認收款</button>
      </div>
    </div>
  </div>

  <div id="reprintSelectionModal" class="modal" :style="shown(reprintModal.open)">
    <div class="modal-content modal-sheet modal-sheet-compact modal-scroll-frame reprint-modal">
      <div class="modal-header"><h2>補印選擇</h2></div>
      <div class="modal-body modal-list-body">
        <label class="reprint-select-all"><input
          id="toggleAllReprint"
          type="checkbox"
          :checked="reprintModal.allChecked"
          @change="sales.toggleAllReprint(inputChecked($event))"
        > 全選</label>
        <div id="reprintSelectionList" class="reprint-list">
          <div v-if="reprintModal.batches.length === 0" class="entry-card">目前沒有可補印的訂單紀錄</div>
          <label v-for="batch in reprintModal.batches" :key="batch.batchId" class="cart-item-row">
            <span><input
              class="reprint-checkbox"
              type="checkbox"
              :checked="reprintModal.selected.has(batch.batchId)"
              @change="sales.setReprintSelected(batch.batchId, inputChecked($event))"
            > {{ batch.requestLabel }}</span>
            <span class="cart-item-price">{{ formatCurrency(batch.subtotal) }}</span>
          </label>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-effect cancel" @click="sales.closeReprintModal()">取消</button>
        <button type="button" class="btn-effect confirm-success" @click="sales.confirmReprintSelection()">補印</button>
      </div>
    </div>
  </div>

  <div id="staffDiscountModal" class="modal" :style="shown(discountModal.open)">
    <div class="modal-content modal-sheet modal-sheet-compact">
      <h2>整單折數</h2>
      <div class="payment-info">
        <div class="pay-row"><span>原價</span><span id="staffDiscountOriginal">{{ formatCurrency(discountModal.original) }}</span></div>
        <div class="pay-row">
          <span>折數 (%)</span>
          <div class="discount-input-inline">
            <input
              id="staffDiscountInput"
              type="number"
              min="1"
              max="100"
              :value="discountModal.input"
              @input="discountModal.input = inputValue($event)"
            >
            <span class="discount-percent">%</span>
          </div>
        </div>
        <p id="staffDiscountPreview" class="discount-preview">{{ discountPreview }}</p>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-effect cancel" @click="sales.closeDiscountModal()">取消</button>
        <button type="button" class="btn-effect floating-clear-btn" @click="sales.resetDiscount()">清除折扣</button>
        <button type="button" class="btn-effect confirm-primary" @click="sales.confirmDiscount()">套用</button>
      </div>
    </div>
  </div>

  <div id="qrCodeModal" class="modal" :style="shown(qrModal.open)">
    <div class="modal-content">
      <div class="modal-header"><h2>客人點餐 QR Code</h2></div>
      <div class="modal-body">
        <h3 id="qrTableTitle">{{ qrModal.table }}</h3>
        <div id="qrcode"><QrCodeCanvas v-if="qrModal.url" :text="qrModal.url" :size="220" /></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-effect cancel" @click="sales.closeQrModal()">關閉</button>
      </div>
    </div>
  </div>

  <div id="pendingBatchOverlay" class="pending-overlay" :class="{ show: pendingOverlay }">
    <div class="pending-overlay-card">
      <div class="pending-overlay-head">
        <div>
          <h2>顧客待接單</h2>
          <p id="pendingOverlayTitle" class="panel-subtitle">
            {{ pendingOverlay ? `桌號：${pendingOverlay.table} · ${pendingOverlay.preview.requestLabel}` : '' }}
          </p>
        </div>
      </div>
      <div id="pendingOverlayList" class="pending-overlay-list">
        <template v-if="pendingOverlay?.resolved">
          <div v-for="entry in pendingOverlay.resolved.entries" :key="entry.entryId" class="entry-card">
            <div class="entry-card-head">
              <EntryThumb class="entry-card-thumb" :entry="entry" />
              <div>
                <div class="entry-card-title">{{ entry.summary.title }}</div>
                <EntrySubtitles
                  :lines="[
                    { text: entry.summary.quantityLabel },
                    { text: kernel.helpers.buildEntryDisplaySummary(entry).mainSummary },
                    { text: kernel.helpers.buildEntryDisplaySummary(entry).drinkSummary },
                  ]"
                />
              </div>
              <div class="entry-card-total"><AdjustedAmount :display="getEntryAdjustedAmountDisplay(entry)" /></div>
            </div>
          </div>
        </template>
        <template v-else-if="pendingOverlay">
          <div
            v-for="(entry, index) in pendingOverlay.preview.entries"
            :key="index"
            class="entry-card pending-overlay-preview-card"
            :class="{ 'is-loading': pendingOverlay.loading, 'is-error': pendingOverlay.error }"
          >
            <div class="entry-card-head">
              <div>
                <div class="entry-card-title">{{ entry.title }}</div>
                <EntrySubtitles
                  :lines="[
                    { text: entry.quantityLabel },
                    {
                      text: pendingOverlay.error || (pendingOverlay.loading ? '正在載入訂單明細…' : '等待載入完整明細'),
                      className: 'pending-overlay-preview-copy',
                    },
                  ]"
                />
              </div>
              <div class="entry-card-total pending-overlay-preview-total">{{ pendingOverlay.error ? '明細未載入' : '載入中' }}</div>
            </div>
          </div>
        </template>
      </div>
      <div class="pending-overlay-actions">
        <button v-if="bellPlaying" type="button" class="btn-effect cancel" @click="bell.stop()">停止鈴聲</button>
        <button v-else-if="bellBlocked && bellEnabled" type="button" class="btn-effect cancel" @click="bell.preview()">啟用鈴聲</button>
        <button type="button" class="btn-effect cancel" @click="sales.rejectPendingBatch()">拒絕</button>
        <button type="button" class="btn-effect confirm-success" @click="sales.acceptPendingBatch()">接單</button>
      </div>
    </div>
  </div>
</template>
