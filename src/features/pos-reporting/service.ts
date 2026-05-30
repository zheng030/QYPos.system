export const POS_REPORTING_SERVICE_KEY = 'pos-reporting'

export type PosReportingService = {
  showHistory(): void
  generateReport(type: string): Promise<void>
  renderCalendar(): Promise<void>
  renderItemStats(range: string): Promise<void>
  renderPublicStats(): Promise<void>
  openItemStatsPage(): void
  stopAllWatches(): void
}
