<script setup lang="ts">
import { usePosRuntime } from '@/app/runtime'
import { authGate } from '@/shared/auth-gate'

const { shell } = usePosRuntime()
const { appVisible, loginPassword, loginErrorVisible } = shell
const authNotice = authGate.getDevBypassNotice()

function errorDisplay() {
  if (loginErrorVisible.value === null) {
    return undefined
  }
  return loginErrorVisible.value ? 'block' : 'none'
}
</script>

<template>
  <div id="login-screen" :style="{ display: appVisible ? 'none' : undefined }">
    <div class="login-box">
      <h1>系統登入</h1>
      <p>請輸入員工密碼</p>
      <p v-if="authNotice" class="dev-auth-notice">{{ authNotice }}</p>
      <input
        id="loginPass"
        v-model="loginPassword"
        type="password"
        placeholder="密碼"
        @keydown.enter.prevent="shell.checkLogin()"
      >
      <button type="button" class="btn-effect" @click="shell.checkLogin()">進入系統</button>
      <p id="loginError" class="login-error-msg" :style="{ display: errorDisplay() }">密碼錯誤</p>
    </div>
  </div>
</template>
