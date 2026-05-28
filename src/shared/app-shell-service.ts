import type { PosPageId } from '@/shared/pos-page'

export const APP_SHELL_SERVICE_KEY = 'app-shell'

export type AppShellService = {
  showHome(): void
  showPage(pageId: PosPageId): void
  getActivePage(): PosPageId
  subscribe(listener: (pageId: PosPageId) => void): () => void
}
