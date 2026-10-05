<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'

import { QUICK_PANEL_ID, type StockStatus } from '../product-management'

const { router, shell, admin } = usePosRuntime()
const { openPanels, productView } = admin

const STATUS_STYLES: Record<StockStatus, { label: string; color: string }> = {
  available: { label: '有貨', color: '#06d6a0' },
  'sold-out': { label: '售完', color: '#ef476f' },
  partial: { label: '部分售完', color: '#f59e0b' },
}

function statusStyle(status: StockStatus) {
  return STATUS_STYLES[status]
}

function checkedOf(event: Event) {
  return (event.target as HTMLInputElement).checked
}
</script>

<template>
  <div id="productPage" :style="{ display: router.pageDisplay('productPage') }">
    <button type="button" class="back btn-effect" @click="shell.goHome()">返回主畫面</button>
    <div class="title">商品庫存管理</div>
    <div class="product-mgmt-box">
      <p class="product-mgmt-desc">保留顯示、可切換售完。</p>
      <div id="productManagementList">
        <button type="button"
          class="accordion-header-mgmt btn-effect"
          :class="{ active: openPanels.has(QUICK_PANEL_ID) }"
          @click="admin.toggleAccordion(QUICK_PANEL_ID)"
        >
          <span>⚡ 快速切換</span>
          <span class="arrow">▼</span>
        </button>
        <div :id="QUICK_PANEL_ID" class="accordion-content" :class="{ show: openPanels.has(QUICK_PANEL_ID) }">
          <div class="product-mgmt-quick-panel">
            <section v-for="section in productView.quickSections" :key="section.id" class="product-mgmt-quick-group">
              <h3>{{ section.title }}</h3>
              <div class="product-mgmt-quick-list">
                <div v-for="row in section.rows" :key="row.id" class="product-mgmt-row">
                  <span style="font-size:14px; color:#555;">{{ row.label }}</span>
                  <div style="display:flex; align-items:center; gap:10px;">
                    <span :style="{ color: statusStyle(row.status).color, fontWeight: 'bold' }">{{ statusStyle(row.status).label }}</span>
                    <label class="toggle-switch">
                      <input
                        type="checkbox"
                        :checked="row.checked"
                        @change="admin.toggleInventoryBatch(row.keys, checkedOf($event))"
                      >
                      <span class="slider" />
                    </label>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
        <template v-for="category in productView.categories" :key="category.accordionId">
          <button type="button"
            class="accordion-header-mgmt btn-effect"
            :class="{ active: openPanels.has(category.accordionId) }"
            @click="admin.toggleAccordion(category.accordionId)"
          >
            <span>{{ `📂 ${category.label}` }}</span>
            <span class="arrow">▼</span>
          </button>
          <div :id="category.accordionId" class="accordion-content" :class="{ show: openPanels.has(category.accordionId) }">
            <template v-for="item in category.items" :key="item.id">
              <div class="product-mgmt-row">
                <span style="font-size:16px; font-weight:500;">{{ item.name }}</span>
                <div style="display:flex; align-items:center; gap:10px;">
                  <span :style="{ color: statusStyle(item.available ? 'available' : 'sold-out').color, fontWeight: 'bold' }">
                    {{ statusStyle(item.available ? 'available' : 'sold-out').label }}
                  </span>
                  <label class="toggle-switch">
                    <input
                      type="checkbox"
                      :checked="item.available"
                      @change="admin.toggleStockStatus(item.id, checkedOf($event))"
                    >
                    <span class="slider" />
                  </label>
                </div>
              </div>
              <div
                v-for="option in item.options"
                :key="option.inventoryKey"
                class="product-mgmt-row"
                style="padding-left:20px;"
              >
                <span style="font-size:14px; color:#555;">{{ option.label }}</span>
                <div style="display:flex; align-items:center; gap:10px;">
                  <span :style="{ color: statusStyle(option.available ? 'available' : 'sold-out').color, fontWeight: 'bold' }">
                    {{ statusStyle(option.available ? 'available' : 'sold-out').label }}
                  </span>
                  <label class="toggle-switch">
                    <input
                      type="checkbox"
                      :checked="option.available"
                      @change="admin.toggleOptionStock(item.id, option.inventoryKey, checkedOf($event))"
                    >
                    <span class="slider" />
                  </label>
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
