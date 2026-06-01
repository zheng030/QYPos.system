export const POS_ADMIN_SERVICE_KEY = 'pos-admin'

export type PosAdminService = {
  updateFinancialPage(): void
  renderConfidentialCalendar(): Promise<void>
  stopAllWatches(): void
  renderProductManagement(): void
  downloadSyncLog(): void
  downloadLocalStorage(): void
  closeSummaryModal(): void
}
