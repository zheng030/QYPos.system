<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'
import { NEW_ORDER_SOUNDS, type NewOrderSound } from '@/features/pos-sales/new-order-bell'

const { router, shell, admin, sales, bell } = usePosRuntime()
const {
  enabled: bellEnabled,
  volume: bellVolume,
  sound: bellSound,
  ringing: bellRinging,
  previewing: bellPreviewing,
} = bell
const soundChoices = Object.keys(NEW_ORDER_SOUNDS) as NewOrderSound[]
const { noticeForm, noticeEditor } = admin

function checkedOf(event: Event) {
  return (event.target as HTMLInputElement).checked
}

function volumeOf(event: Event) {
  return (event.target as HTMLInputElement).valueAsNumber
}
</script>

<template>
  <div id="settingsPage" :style="{ display: router.pageDisplay('settingsPage') }">
    <button type="button" class="back btn-effect" @click="shell.goHome()">返回主畫面</button>
    <div class="title">系統設定</div>

    <section class="settings-card">
      <div class="settings-header"><h3>顧客點餐</h3></div>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>掃碼提示視窗</strong>
          <span>顧客掃描 QR Code 後先看到這則提示，按「確認」才進入菜單</span>
        </div>
        <div class="settings-row-actions">
          <label class="toggle-switch">
            <input
              id="customerNoticeToggle"
              v-model="noticeForm.enabled"
              type="checkbox"
              aria-label="掃碼提示視窗"
              :disabled="!noticeEditor.loaded || noticeEditor.saving"
            >
            <span class="slider" />
          </label>
        </div>
      </div>
      <div class="settings-form">
        <label class="settings-field">
          <span>標題</span>
          <input
            id="customerNoticeTitleInput"
            v-model="noticeForm.title"
            type="text"
            maxlength="30"
            placeholder="例如：用餐須知"
            :disabled="!noticeEditor.loaded || noticeEditor.saving"
          >
        </label>
        <label class="settings-field">
          <span>內容</span>
          <textarea
            id="customerNoticeMessageInput"
            v-model="noticeForm.message"
            rows="5"
            maxlength="500"
            placeholder="例如：每人低消一杯飲品，用餐時間 90 分鐘"
            :disabled="!noticeEditor.loaded || noticeEditor.saving"
          />
        </label>
        <div class="settings-form-actions">
          <span v-if="noticeEditor.missingContent" class="settings-form-hint">開啟時需要標題或內容</span>
          <span v-else-if="noticeEditor.dirty" class="settings-form-hint">尚未儲存</span>
          <button
            type="button"
            class="settings-action-btn btn-effect"
            :disabled="!noticeEditor.hasContent || noticeEditor.saving"
            @click="sales.customerNotice.preview(admin.noticeDraft())"
          >
            👀 預覽
          </button>
          <button
            type="button"
            class="settings-save-btn btn-effect"
            :disabled="!noticeEditor.canSave"
            @click="admin.saveCustomerNotice()"
          >
            {{ noticeEditor.saving ? '儲存中…' : '儲存' }}
          </button>
        </div>
      </div>
    </section>

    <section class="settings-card">
      <div class="settings-header"><h3>這台裝置</h3></div>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>新訂單鈴聲</strong>
          <span>顧客送出訂單時循環響鈴，直到接單或按暫停，只影響這台裝置；開啟時螢幕保持常亮，避免漏單</span>
        </div>
        <div class="settings-row-actions">
          <button v-if="bellRinging" type="button" class="settings-action-btn btn-effect" @click="bell.pause()">暫停鈴聲</button>
          <button v-else-if="bellPreviewing" type="button" class="settings-action-btn btn-effect" @click="bell.stopPreview()">停止試聽</button>
          <button v-else type="button" class="settings-action-btn btn-effect" @click="bell.preview()">🔔 試聽</button>
          <label class="toggle-switch">
            <input
              id="newOrderBellToggle"
              type="checkbox"
              aria-label="新訂單鈴聲"
              :checked="bellEnabled"
              @change="bell.setEnabled(checkedOf($event))"
            >
            <span class="slider" />
          </label>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>鈴聲</strong>
          <span>選擇後會播放一次</span>
        </div>
        <div class="settings-row-actions" role="group" aria-label="鈴聲">
          <button
            v-for="choice in soundChoices"
            :key="choice"
            type="button"
            class="settings-action-btn btn-effect"
            :aria-pressed="bellSound === choice"
            @click="bell.setSound(choice)"
          >
            {{ NEW_ORDER_SOUNDS[choice].label }}
          </button>
        </div>
      </div>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>鈴聲音量</strong>
          <span>最大音量仍由裝置音量決定</span>
        </div>
        <div class="settings-volume-control">
          <input
            id="newOrderBellVolume"
            type="range"
            aria-label="鈴聲音量"
            min="0"
            max="100"
            step="1"
            :value="bellVolume"
            @input="bell.setVolume(volumeOf($event))"
          >
          <output for="newOrderBellVolume">{{ bellVolume }}%</output>
        </div>
      </div>
    </section>

    <section class="settings-card">
      <div class="settings-header"><h3>資料與維護</h3></div>
      <div class="settings-row">
        <div class="settings-row-text">
          <strong>同步紀錄</strong>
          <span>下載這台裝置的資料同步紀錄，回報問題時附上</span>
        </div>
        <div class="settings-row-actions">
          <button type="button" class="settings-action-btn btn-effect" @click="admin.downloadSyncLog()">🔧 匯出</button>
        </div>
      </div>
    </section>
  </div>
</template>
