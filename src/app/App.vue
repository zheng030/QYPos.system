<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import CheckinPage from '@/features/checkin/components/CheckinPage.vue'
import ConfidentialPage from '@/features/pos-admin/components/ConfidentialPage.vue'
import ProductPage from '@/features/pos-admin/components/ProductPage.vue'
import RevenueDetailModal from '@/features/pos-admin/components/RevenueDetailModal.vue'
import SettingsPage from '@/features/pos-admin/components/SettingsPage.vue'
import HistoryPage from '@/features/pos-reporting/components/HistoryPage.vue'
import ItemStatsPage from '@/features/pos-reporting/components/ItemStatsPage.vue'
import ReportPage from '@/features/pos-reporting/components/ReportPage.vue'
import SummaryModal from '@/features/pos-reporting/components/SummaryModal.vue'
import CustomerNoticeModal from '@/features/pos-sales/components/CustomerNoticeModal.vue'
import OrderPage from '@/features/pos-sales/components/OrderPage.vue'
import SalesModals from '@/features/pos-sales/components/SalesModals.vue'
import TableSelectPage from '@/features/pos-sales/components/TableSelectPage.vue'
import HomePage from '@/features/pos-shell/components/HomePage.vue'
import LoginScreen from '@/features/pos-shell/components/LoginScreen.vue'
import ImagePreviewHost from '@/shared/ui/ImagePreviewHost.vue'
import ReceiptPrintArea from '@/shared/ui/ReceiptPrintArea.vue'
import ToastContainer from '@/shared/ui/ToastContainer.vue'

import { usePosRuntime } from './runtime'

const { printer, toast, shell, kernel, sound, bell } = usePosRuntime()
const { appVisible } = shell

// Browsers allow audio only after a gesture: the first staff tap or key press unlocks the audio output. pointerup,
// not pointerdown: a touch only counts as a gesture once the finger lifts. Customer phones never ring.
function removeSoundListeners() {
  document.removeEventListener('pointerup', unlockStaffSound, true)
  document.removeEventListener('keydown', unlockStaffSound, true)
}

function unlockStaffSound() {
  if (new URLSearchParams(location.search).get('table') || kernel.state.currentMode === 'customer') return
  removeSoundListeners()
  void bell.unlock()
}

onMounted(() => {
  document.addEventListener('pointerup', unlockStaffSound, true)
  document.addEventListener('keydown', unlockStaffSound, true)
})
onUnmounted(() => {
  removeSoundListeners()
  bell.dispose()
  void sound.dispose()
})
</script>

<template>
  <ReceiptPrintArea :printer="printer" />
  <ToastContainer :toast="toast" />
  <ImagePreviewHost />
  <LoginScreen />
  <div id="app-container" :style="{ display: appVisible ? 'block' : 'none' }">
    <HomePage />
    <TableSelectPage />
    <OrderPage />
    <HistoryPage />
    <ReportPage />
    <ConfidentialPage />
    <SettingsPage />
    <ProductPage />
    <ItemStatsPage />
    <CheckinPage />
  </div>
  <SummaryModal />
  <SalesModals />
  <RevenueDetailModal />
  <CustomerNoticeModal />
</template>
