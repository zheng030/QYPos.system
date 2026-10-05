<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'

const { router, sales, admin, checkin } = usePosRuntime()

const MENU = [
  { icon: '🛒', label: '點餐系統', open: () => sales.openTableSelect() },
  { icon: '📋', label: '今日訂單', open: () => router.showPage('historyPage') },
  { icon: '📊', label: '營業報表', open: () => router.showPage('reportPage') },
  { icon: '🕒', label: '打卡系統', open: () => checkin.open() },
  { icon: '🤫', label: '成本輸入', open: () => admin.openFinancePage('cost') },
  { icon: '🔐', label: '財務/詳單', open: () => admin.openFinancePage('finance') },
  { icon: '🛠️', label: '系統設定', open: () => admin.openSettingsPage() },
  { icon: '📦', label: '商品庫存', open: () => admin.openProductPage() },
  { icon: '📈', label: '歷史銷量', open: () => router.showPage('itemStatsPage') },
]
</script>

<template>
  <div id="home" :style="{ display: router.pageDisplay('home') }">
    <div v-for="item in MENU" :key="item.label" class="menu-btn" @click="item.open()">
      <span class="menu-icon">{{ item.icon }}</span>
      <span>{{ item.label }}</span>
    </div>
  </div>
</template>
