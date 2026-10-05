<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'
import { getGroupedOrderLines } from '@/shared/grouped-order-lines'

const { router, shell, reporting } = usePosRuntime()
const { historyOrders, historySimpleMode, expandedHistoryRows } = reporting
</script>

<template>
  <div id="historyPage" :style="{ display: router.pageDisplay('historyPage') }">
    <button type="button" class="back btn-effect" @click="shell.goHome()">返回主畫面</button>
    <div class="title">今日訂單列表</div>
    <div class="history-header-row">
      <span>序號</span><span>桌號</span><span>客人資訊</span><span>時間</span><span>金額</span>
    </div>
    <div id="history-box">
      <div v-if="historyOrders && historyOrders.length === 0" style="padding:20px;color:#8d99ae;">今日尚無訂單</div>
      <template v-else-if="historyOrders">
        <div class="view-toggle-container">
          <button type="button" class="view-toggle-btn btn-effect" @click="reporting.toggleHistoryView()">
            <span>{{ historySimpleMode ? '切換為詳細清單' : '切換為簡化清單' }}</span>
          </button>
        </div>
        <template v-for="(order, index) in historyOrders" :key="order.orderId || index">
          <div class="history-row btn-effect" @click="reporting.toggleHistoryRow(index)">
            <span class="seq" style="font-weight:bold; color:#4361ee;">
              {{ order.formattedSeq ? `#${order.formattedSeq}` : `#${historyOrders.length - index}` }}
            </span>
            <span class="seat">{{ order.seat || order.table || '' }}</span>
            <span class="cust">{{ order.customerName || '-' }}</span>
            <span class="time">{{ order.time.split(' ')[1] || order.time }}</span>
            <span class="amt">
              <template v-if="order.originalTotal && order.originalTotal !== order.total">
                <span style="text-decoration:line-through; color:#999; font-size:12px;">{{ `$${order.originalTotal}` }}</span><br><span style="color:#ef476f;">{{ `$${order.total}` }}</span>
              </template>
              <template v-else>{{ `$${order.total}` }}</template>
            </span>
          </div>
          <div
            :id="`detail-${index}`"
            class="history-detail"
            :style="{ display: expandedHistoryRows.has(index) ? 'block' : 'none' }"
          >
            <div style="background:#f8fafc; padding:15px; border-radius:0 0 12px 12px; border:1px solid #eee; border-top:none;">
              <b>📅 完整時間：</b>{{ order.time }}<br><b>🧾 內容：</b><br>
              <template v-for="group in getGroupedOrderLines(order)" :key="group.groupId">
                <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #eee;">
                  <span>{{ `${group.main.shortName}${group.main.selectionSummary ? ` (${group.main.selectionSummary})` : ''}${group.main.quantity > 1 ? ' ' : ''}` }}<b v-if="group.main.quantity > 1" style="color:#ef476f;">{{ `x${group.main.quantity}` }}</b></span>
                  <span>{{ `$${group.main.lineTotal}` }}</span>
                </div>
                <div
                  v-for="line in group.children"
                  :key="line.lineId"
                  style="display:flex;justify-content:space-between;padding:4px 0 4px 20px;color:#64748b;"
                >
                  <span>{{ `${line.shortName}${line.selectionSummary ? ` (${line.selectionSummary})` : ''}` }}</span>
                  <span>{{ line.lineTotal > 0 ? `$${line.lineTotal}` : '' }}</span>
                </div>
              </template>
              <div style="text-align:right; margin-top:10px; font-size:18px; font-weight:bold; color:#ef476f;">
                {{ `總計：$${order.total}` }}
              </div>
              <div
                style="text-align:right; margin-top:15px; border-top:1px solid #ddd; padding-top:10px; display:flex; justify-content:flex-end; gap:10px;"
              >
                <button type="button" class="print-btn btn-effect" @click="reporting.reprintOrder(index)">🖨 列印明細</button>
                <button type="button" class="delete-order-btn btn-effect" @click="reporting.deleteOrder(index)">🗑 刪除此筆訂單</button>
              </div>
            </div>
          </div>
        </template>
      </template>
    </div>
    <button type="button" class="end-business-btn btn-effect" @click="reporting.openCloseBusinessModal()">結束營業</button>
  </div>
</template>
