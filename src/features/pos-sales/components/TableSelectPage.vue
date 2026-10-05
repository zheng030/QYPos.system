<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'

const { router, shell, sales } = usePosRuntime()
const { systemTime } = shell
const { tableButtons } = sales
</script>

<template>
  <div id="tableSelect" :style="{ display: router.pageDisplay('tableSelect') }">
    <div class="header-row">
      <button type="button" class="back btn-effect" @click="shell.goHome()">返回主畫面</button>
      <button type="button" class="btn-effect qr-code-btn" @click="sales.toggleQrMode()">顯示 QR Code</button>
      <div id="systemTime">{{ systemTime }}</div>
    </div>
    <div class="title">請選擇桌號</div>
    <div id="tableSelectGrid">
      <div
        v-for="button in tableButtons"
        :key="button.table"
        class="tableBtn btn-effect"
        :class="button.statusClass"
        @click="sales.openOrderPage(button.table, { mode: 'staff' })"
      >
        <b>{{ button.table }}</b>
      </div>
    </div>
  </div>
</template>
