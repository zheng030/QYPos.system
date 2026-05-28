export const POS_ADMIN_SERVICE_KEY = 'pos-admin'

export type PosAdminService = {
  updateFinancialPage(ownerName: string): void
  renderConfidentialCalendar(ownerName: string): void
  renderProductManagement(): void
  downloadSyncLog(): void
  downloadLocalStorage(): void
  closeSummaryModal(): void
}
