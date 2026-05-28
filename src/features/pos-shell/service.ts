import type { PosToastOptions } from '@/features/pos-kernel/types'
import type { AppShellService } from '@/shared/app-shell-service'
import type { PosPageId } from '@/shared/pos-page'

export const POS_UI_SERVICE_KEY = 'pos-ui'

export type PosUiService = {
  on(
    type:
      | 'click'
      | 'change'
      | 'input'
      | 'submit'
      | 'keydown'
      | 'compositionstart'
      | 'compositionend'
      | 'mouseover'
      | 'mousemove'
      | 'mouseout',
    action: string,
    handler: (event: Event, element: HTMLElement) => void
  ): void
  startRouter(): void
  showToast(message: string, options?: PosToastOptions): void
  hideAll(): void
  showPage(pageId: PosPageId): void
  activatePage(pageId: PosPageId, display?: 'grid' | 'block'): void
  showHome(): void
  getActivePage(): PosPageId
  subscribePage(listener: (pageId: PosPageId) => void): () => void
}

export type PosShellFeatureService = PosUiService &
  Pick<AppShellService, 'showHome' | 'showPage' | 'getActivePage' | 'subscribe'>
