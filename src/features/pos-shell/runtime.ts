import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { appShellHtml } from '@/app/app-shell'
import { APP_SHELL_SERVICE_KEY, type AppShellService } from '@/shared/app-shell-service'
import { createDomActionRouter } from '@/shared/dom-action-router'
import type { PosPageId } from '@/shared/pos-page'

import { POS_UI_SERVICE_KEY, type PosShellFeatureService, type PosUiService } from './service'

let booted = false

export function createPosShellFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'pos-shell',
    dependsOn: ['pos-kernel'],
    async boot() {
      if (booted) {
        return
      }

      booted = true
      context.root.innerHTML = appShellHtml

      const router = createDomActionRouter(context.root)
      let routerStarted = false
      let activePage: PosPageId = 'home'
      const pageListeners = new Set<(pageId: PosPageId) => void>()
      const hideAllHooks = new Set<() => void>()

      function notifyPage(pageId: PosPageId) {
        activePage = pageId
        pageListeners.forEach((listener) => {
          listener(pageId)
        })
      }

      function hideAll() {
        document.querySelectorAll<HTMLElement>('#app-container > div').forEach((element) => {
          element.style.display = 'none'
        })
        hideAllHooks.forEach((hook) => {
          try {
            hook()
          } catch {}
        })
      }

      function activatePage(pageId: PosPageId, display: 'grid' | 'block' = 'block') {
        hideAll()
        const element = document.getElementById(pageId)
        if (element) {
          element.style.display = display
          notifyPage(pageId)
        }
      }

      function showHome() {
        activatePage('home', 'grid')
      }

      function showPage(pageId: PosPageId) {
        activatePage(pageId, pageId === 'home' ? 'grid' : 'block')
      }

      const uiService: PosUiService = {
        on(type, action, handler) {
          router.on(type, action, handler)
        },
        startRouter() {
          if (routerStarted) {
            return
          }
          routerStarted = true
          router.start()
        },
        showToast(message, options = {}) {
          const toast = document.getElementById('toast-container')
          if (!toast) return
          const stateKey = '__posToastState'
          const toastElement = toast as HTMLElement & {
            [stateKey]?: Map<
              string,
              {
                count: number
                el: HTMLDivElement
                hideTimer: ReturnType<typeof setTimeout> | null
                removeTimer: ReturnType<typeof setTimeout> | null
              }
            >
          }
          if (!toastElement[stateKey]) {
            toastElement[stateKey] = new Map()
          }
          const toastState = toastElement[stateKey]
          if (!toastState) return
          let state = toastState.get(message)
          if (!state) {
            const element = document.createElement('div')
            element.className = 'toast-item'
            state = { count: 0, el: element, hideTimer: null, removeTimer: null }
            toast.appendChild(element)
          }
          state.count = typeof options.count === 'number' && options.count > 0 ? options.count : state.count + 1
          state.el.innerHTML = ''
          const msgSpan = document.createElement('span')
          const plainNode = document.createElement('div')
          plainNode.innerHTML = message
          msgSpan.textContent = plainNode.innerText
          state.el.appendChild(msgSpan)
          if (state.count > 1) {
            const countSpan = document.createElement('span')
            countSpan.textContent = ` x${state.count}`
            countSpan.style.color = '#ef476f'
            countSpan.style.fontWeight = 'bold'
            countSpan.style.marginLeft = '6px'
            state.el.appendChild(countSpan)
          }
          toast.appendChild(state.el)
          if (state.hideTimer) clearTimeout(state.hideTimer)
          if (state.removeTimer) clearTimeout(state.removeTimer)
          requestAnimationFrame(() => state?.el.classList.add('show'))
          state.hideTimer = setTimeout(() => {
            state?.el.classList.remove('show')
            if (!state) return
            state.removeTimer = setTimeout(() => {
              if (state?.el.parentNode) state.el.parentNode.removeChild(state.el)
              toastState.delete(message)
            }, 300)
          }, 2500)
          toastState.set(message, state)
        },
        hideAll,
        showPage,
        activatePage,
        showHome,
        getActivePage() {
          return activePage
        },
        subscribePage(listener) {
          pageListeners.add(listener)
          return () => {
            pageListeners.delete(listener)
          }
        },
        registerHideHook(listener) {
          hideAllHooks.add(listener)
          return () => {
            hideAllHooks.delete(listener)
          }
        },
      }

      const shellService: PosShellFeatureService = {
        ...uiService,
        subscribe(listener) {
          return uiService.subscribePage(listener)
        },
      }

      const appShellService: AppShellService = {
        showHome,
        showPage,
        getActivePage() {
          return activePage
        },
        subscribe(listener) {
          return uiService.subscribePage(listener)
        },
      }

      context.registerService(POS_UI_SERVICE_KEY, shellService)
      context.registerService(APP_SHELL_SERVICE_KEY, appShellService)
      context.registerService('pos-shell-hide-hooks', hideAllHooks)
    },
  }
}
