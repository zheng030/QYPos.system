<script setup lang="ts">
import { computed } from 'vue'

import { usePosRuntime } from '@/app/runtime'

import type { CheckinView } from '../checkin-store'
import { type CheckinIconName, UserRole } from '../constants'
import { getRoleLabel } from '../utils'
import CheckinAvatar from './CheckinAvatar.vue'
import CheckinIcon from './CheckinIcon.vue'

type NavItem = { id: CheckinView; label: string; icon: CheckinIconName; roles: string[] }

const { checkin } = usePosRuntime()
const { state, currentUser } = checkin

const MENU_ITEMS: NavItem[] = [
  { id: 'clock', label: '打卡', icon: 'clock', roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
  { id: 'dashboard', label: '儀表板', icon: 'layout', roles: [UserRole.ADMIN] },
  { id: 'individual', label: '個人儀表板', icon: 'user', roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
  { id: 'reports', label: '報表', icon: 'file-bar', roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
  { id: 'employees', label: '員工', icon: 'users', roles: [UserRole.ADMIN] },
  { id: 'password', label: '修改密碼', icon: 'lock', roles: [UserRole.ADMIN, UserRole.EMPLOYEE] },
]

const desktopItems = computed(() => MENU_ITEMS.filter((item) => currentUser.value && item.roles.includes(currentUser.value.role)))
const mobileItems = computed(() =>
  MENU_ITEMS.slice(0, 5).filter((item) => currentUser.value && item.roles.includes(currentUser.value.role))
)
</script>

<template>
  <template v-if="currentUser">
    <header class="checkin-header">
      <div class="checkin-header__inner">
        <div class="checkin-header__left">
          <div class="checkin-brand"><span class="checkin-brand__text">打卡系統</span></div>
          <nav class="checkin-nav">
            <button type="button"
              v-for="item in desktopItems"
              :key="item.id"
              class="checkin-nav__item"
              :class="{ 'is-active': state.currentView === item.id }"
              @click="checkin.navigate(item.id)"
            >
              <CheckinIcon :name="item.icon" /><span>{{ item.label }}</span>
            </button>
          </nav>
        </div>
        <div class="checkin-user">
          <div class="checkin-user__meta">
            <div class="checkin-user__name">{{ currentUser.name }}</div>
            <div class="checkin-user__role">{{ getRoleLabel(currentUser.role) }}</div>
          </div>
          <CheckinAvatar class="checkin-avatar--sm" :name="currentUser.name" />
          <button type="button" class="checkin-icon-btn checkin-icon-btn--danger" title="登出" @click="checkin.logout()">
            <CheckinIcon name="logout" />
          </button>
        </div>
      </div>
    </header>
    <nav class="checkin-nav-mobile">
      <button type="button"
        v-for="item in mobileItems"
        :key="item.id"
        class="checkin-nav-mobile__item"
        :class="{ 'is-active': state.currentView === item.id }"
        @click="checkin.navigate(item.id)"
      >
        <CheckinIcon :name="item.icon" /><span>{{ item.label }}</span>
      </button>
    </nav>
  </template>
</template>
