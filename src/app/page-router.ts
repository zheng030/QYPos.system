import { shallowRef } from 'vue'

import type { PosPageId } from '@/shared/pos-page'

export type PageRouter = ReturnType<typeof createPageRouter>

export function createPageRouter() {
  const activePage = shallowRef<PosPageId | null>(null)
  const leaveHooks: Array<() => void> = []
  const enterHooks: Array<(pageId: PosPageId) => void> = []

  // Hooks run synchronously so a feature can stop the previous page's live watches before the next
  // page starts its own.
  function showPage(pageId: PosPageId) {
    for (const hook of leaveHooks) {
      try {
        hook()
      } catch {}
    }
    activePage.value = pageId
    for (const hook of enterHooks) {
      hook(pageId)
    }
  }

  function pageDisplay(pageId: PosPageId) {
    if (activePage.value === null) {
      return pageId === 'checkinPage' ? 'none' : ''
    }
    if (activePage.value !== pageId) {
      return 'none'
    }
    return pageId === 'home' ? 'grid' : 'block'
  }

  return {
    activePage,
    showPage,
    pageDisplay,
    onLeave(hook: () => void) {
      leaveHooks.push(hook)
    },
    onEnter(hook: (pageId: PosPageId) => void) {
      enterHooks.push(hook)
    },
  }
}
