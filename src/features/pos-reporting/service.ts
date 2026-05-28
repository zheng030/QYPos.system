export const POS_REPORTING_SERVICE_KEY = 'pos-reporting'

export type PosReportingService = {
  showHistory(): void
  generateReport(type: string): void
  renderCalendar(): void
  renderItemStats(range: string): void
  renderPublicStats(): void
  openItemStatsPage(): void
}
