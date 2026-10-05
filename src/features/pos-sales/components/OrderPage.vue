<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import { formatCurrency } from '../runtime-utils'
import type { OrderTab } from '../sales-store'
import BatchCard from './BatchCard.vue'
import BuilderModal from './BuilderModal.vue'
import DraftEntryCard from './DraftEntryCard.vue'
import ItemImageButton from './ItemImageButton.vue'
import StaffWorkspace from './StaffWorkspace.vue'

const { router, shell, sales } = usePosRuntime()
const {
  mode,
  seatLabel,
  activeCategory,
  appliedTab,
  customerInfo,
  draftEntries,
  visibleBatches,
  floatingBar,
  menuCategories,
  menuSections,
  drinkTemperatures,
  workspace,
} = sales
const { seatTimer } = shell

const tabs: Array<{ id: OrderTab; label: string }> = [
  { id: 'menu', label: '菜單' },
  { id: 'cart', label: '購物車' },
  { id: 'orders', label: '訂單紀錄' },
]

const draftTotal = computed(() => draftEntries.value.reduce((sum, entry) => sum + entry.subtotal, 0))

const pausedTemperatures = computed(() =>
  drinkTemperatures.value
    .filter((option) => !option.available)
    .map((option) => option.label)
    .join('、')
)

function checkedOf(event: Event) {
  return (event.target as HTMLInputElement).checked
}

function onCustomerInput(field: 'name' | 'phone', event: Event) {
  void sales.setCustomerField(field, (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div id="orderPage" :style="{ display: router.pageDisplay('orderPage') }">
    <div class="order-page-shell">
      <div class="order-toolbar">
        <button type="button" class="back btn-effect" @click="sales.openTableSelect()">返回</button>
        <div class="title">點餐中 <span id="seatLabel">{{ seatLabel }}</span></div>
        <div id="seatTimer">{{ seatTimer }}</div>
      </div>

      <div id="orderCustomerBox" class="customer-input-box" style="display: flex;">
        <input
          id="custName"
          type="text"
          placeholder="客人姓名"
          :value="customerInfo.name"
          @input="onCustomerInput('name', $event)"
        >
        <input
          id="custPhone"
          type="tel"
          placeholder="電話號碼"
          :value="customerInfo.phone"
          @input="onCustomerInput('phone', $event)"
        >
      </div>

      <div id="orderPageBody" class="order-page-body">
        <div id="customerOrderShell" class="order-tab-shell">
          <div id="orderToolbarTabs" class="order-toolbar-actions">
            <button type="button"
              v-for="tab in tabs"
              :key="tab.id"
              class="btn-effect"
              :class="{ active: appliedTab === tab.id }"
              @click="sales.setOrderTab(tab.id)"
            >
              {{ tab.label }}
            </button>
          </div>

          <section id="orderMenuPanel" class="order-panel order-menu-panel" :class="{ 'is-active': appliedTab === 'menu' }">
            <div class="order-panel-head">
              <div>
                <h2 class="panel-title">菜單</h2>
                <p id="menuPanelSubtitle" class="panel-subtitle">依主分類瀏覽與加點</p>
              </div>
            </div>
            <div id="menuCategoryChips" class="menu-category-chips">
              <button type="button"
                v-for="category in menuCategories"
                :key="category.key"
                class="categoryBtn btn-effect"
                :class="{ active: activeCategory === category.key }"
                @click="sales.selectCategory(category.key)"
              >
                {{ category.label }}
              </button>
            </div>
            <div v-if="activeCategory === 'drink' && mode === 'staff'" id="drinkTemperatureBar" class="drink-temperature-bar">
              <span class="drink-temperature-title">快速開關</span>
              <div
                v-for="option in drinkTemperatures"
                :key="option.value"
                class="drink-temperature-switch"
                :class="{ paused: !option.available }"
              >
                <span>{{ option.available ? option.label : `${option.label}暫停` }}</span>
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    :aria-label="option.label"
                    :checked="option.available"
                    @change="sales.setDrinkTemperatureAvailable(option.soldOutKey, checkedOf($event))"
                  >
                  <span class="slider" />
                </label>
              </div>
            </div>
            <p v-else-if="activeCategory === 'drink' && pausedTemperatures" id="drinkTemperatureNotice" class="drink-temperature-notice">
              目前暫停供應{{ pausedTemperatures }}
            </p>
            <div id="menuGrid" class="order-menu-grid">
              <div v-if="!menuSections" class="entry-card">目前沒有分類資料</div>
              <template v-for="section in menuSections || []" :key="section.label">
                <div class="sub-cat-title">{{ section.label }}</div>
                <template v-for="{ item, soldOut, price } in section.items" :key="item.id">
                  <article v-if="item.imageUrl" class="menu-item-card" :class="{ 'sold-out': soldOut }">
                    <ItemImageButton class="menu-card-image" :item="item" />
                    <button type="button" class="item menu-item-main btn-effect" :disabled="soldOut" @click="sales.selectMenuItem(item.id)">
                      <span>
                        {{ item.name }}
                        <div v-if="item.tags?.length" class="menu-item-tags">{{ item.tags.join(' / ') }}</div>
                      </span>
                      <b>{{ formatCurrency(price) }}</b>
                    </button>
                  </article>
                  <button type="button"
                    v-else
                    class="item btn-effect"
                    :class="{ 'sold-out': soldOut }"
                    :disabled="soldOut"
                    @click="sales.selectMenuItem(item.id)"
                  >
                    <span>
                      {{ item.name }}
                      <div v-if="item.tags?.length" class="menu-item-tags">{{ item.tags.join(' / ') }}</div>
                    </span>
                    <b>{{ formatCurrency(price) }}</b>
                  </button>
                </template>
              </template>
            </div>
          </section>

          <section id="orderDraftPanel" class="order-panel order-draft-panel" :class="{ 'is-active': appliedTab === 'cart' }">
            <div class="order-panel-head">
              <div>
                <h2 id="draftPanelTitle" class="panel-title">購物車</h2>
                <p id="draftPanelSubtitle" class="panel-subtitle">
                  {{ mode === 'customer' ? '同桌客人會即時看到同一份購物車' : '僅保留在目前終端，送出後直接成立訂單紀錄' }}
                </p>
              </div>
            </div>
            <div id="cart-list" class="entry-list">
              <div v-if="draftEntries.length === 0" class="entry-card">目前沒有購物車內容</div>
              <DraftEntryCard v-for="entry in draftEntries" :key="entry.entryId" :entry="entry" />
            </div>
            <div class="draft-summary-inline">
              <p id="total">總金額：{{ formatCurrency(draftTotal) }}</p>
            </div>
          </section>

          <section id="orderBatchesPanel" class="order-panel order-batches-panel" :class="{ 'is-active': appliedTab === 'orders' }">
            <div class="order-panel-head">
              <div>
                <h2 id="submittedPanelTitle" class="panel-title">訂單紀錄</h2>
                <p id="submittedPanelSubtitle" class="panel-subtitle">
                  {{ mode === 'customer' ? '待接單與已接單分開顯示' : '可補印、編輯，結帳只統計訂單紀錄' }}
                </p>
              </div>
            </div>
            <div id="submittedBatchList" class="batch-list">
              <div v-if="visibleBatches.length === 0" class="batch-card">目前沒有訂單紀錄</div>
              <BatchCard
                v-for="card in visibleBatches"
                :key="card.batch.batchId"
                :batch="card.batch"
                :editable="card.editable"
                :pending="card.pending"
              />
            </div>
          </section>
        </div>
      </div>

      <BuilderModal />

      <div
        id="customerFloatingBar"
        class="customer-floating-bar"
        :class="mode === 'staff' && (workspace.expanded ? 'is-expanded' : 'is-collapsed')"
        style="display: flex;"
      >
        <div id="customerFloatingMain" class="floating-bar-customer" :style="{ display: mode === 'customer' ? 'flex' : 'none' }">
          <div class="floating-main">
            <div id="floatingActionLabel" class="floating-label">{{ floatingBar.label }}</div>
            <div id="floatingDraftSummary" class="floating-value">{{ `${draftEntries.length} 件 · ${formatCurrency(draftTotal)}` }}</div>
          </div>
          <div class="floating-actions">
            <button type="button"
              id="floatingClearBtn"
              class="btn-effect floating-clear-btn"
              :style="{ display: floatingBar.clearVisible ? 'inline-flex' : 'none' }"
              @click="sales.runFloatingClear(floatingBar.clearAction)"
            >
              {{ floatingBar.clearText }}
            </button>
            <button type="button"
              id="floatingPrimaryBtn"
              class="btn-effect floating-submit-btn"
              :style="{ display: floatingBar.primaryVisible ? 'inline-flex' : 'none' }"
              @click="sales.runFloatingPrimary(floatingBar.primaryAction)"
            >
              {{ floatingBar.primaryText }}
            </button>
          </div>
        </div>

        <StaffWorkspace :style="{ display: mode === 'customer' ? 'none' : 'flex' }" />
      </div>
    </div>
  </div>
</template>
