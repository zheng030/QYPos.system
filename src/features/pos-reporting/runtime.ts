import type { AppContext, FeatureRuntime } from '@/app/app-context'

import { POS_DATA_SERVICE_KEY, type PosDataService } from '@/features/pos-data/service'
import { POS_KERNEL_SERVICE_KEY, type PosKernelService } from '@/features/pos-kernel/service'
import { POS_UI_SERVICE_KEY, type PosUiService } from '@/features/pos-shell/service'
import { createHistoryReportingModule } from './history-reporting'
import { POS_REPORTING_SERVICE_KEY, type PosReportingService } from './service'
import { moveSegmentHighlighter, toggleDetail } from './ui'

let booted = false

export function createPosReportingFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'pos-reporting',
    dependsOn: ['pos-data', 'pos-shell'],
    async boot() {
      if (booted) {
        return
      }

      const kernel = context.getService<PosKernelService>(POS_KERNEL_SERVICE_KEY)
      const data = context.getService<PosDataService>(POS_DATA_SERVICE_KEY)
      const ui = context.getService<PosUiService>(POS_UI_SERVICE_KEY)
      if (!kernel || !data || !ui) {
        throw new Error('POS reporting dependencies are not ready')
      }

      booted = true

      const reporting = createHistoryReportingModule({
        getIsHistorySimpleMode: () => kernel.state.isHistorySimpleMode,
        getItemCategoryType: kernel.helpers.getItemCategoryType,
        listClosedOrdersForBusinessDay: data.listClosedOrdersForBusinessDay,
        listClosedOrdersByRange: data.listClosedOrdersByRange,
        loadDailySummariesRange: data.loadDailySummariesRange,
        loadItemStatsRange: data.loadItemStatsRange,
        watchClosedOrdersForBusinessDay: data.watchClosedOrdersForBusinessDay,
        watchDailySummariesRange: data.watchDailySummariesRange,
        watchItemStatsRange: data.watchItemStatsRange,
        readDailySummariesRange: data.readDailySummariesRange,
        readItemStatsRange: data.readItemStatsRange,
        moveSegmentHighlighter,
        openPage: (pageId) => ui.showPage(pageId as never),
        printReceipt: context.getService<{ printReceipt: (data: unknown, isTicket?: boolean) => Promise<void> }>(
          'pos-sales'
        )?.printReceipt as never,
        deleteClosedOrder: data.deleteClosedOrder,
        setIsHistorySimpleMode(value) {
          kernel.state.isHistorySimpleMode = value
        },
      })

      ui.on('click', 'open-page', (_event, element) => {
        const pageId = element.dataset.page
        if (pageId) {
          ui.showPage(pageId as never)
        }
      })
      ui.on('click', 'open-item-stats-page', () => {
        reporting.openItemStatsPage()
      })
      ui.on('click', 'toggle-history-view', () => {
        reporting.toggleHistoryView()
      })
      ui.on('click', 'toggle-detail', (_event, element) => {
        const id = element.dataset.id
        if (id) toggleDetail(id)
      })
      ui.on('click', 'reprint-order', (_event, element) => {
        const index = Number(element.dataset.index || '')
        if (!Number.isNaN(index)) void reporting.reprintOrder(index)
      })
      ui.on('click', 'delete-order', (_event, element) => {
        const index = Number(element.dataset.index || '')
        if (!Number.isNaN(index)) void reporting.deleteSingleOrder(index)
      })
      ui.on('click', 'change-stats-month', (_event, element) => {
        reporting.changeStatsMonth(Number(element.dataset.offset || 0))
      })
      ui.on('click', 'generate-report', (_event, element) => {
        const range = element.dataset.range
        if (range) reporting.generateReport(range)
      })
      ui.on('click', 'render-item-stats', (_event, element) => {
        const range = element.dataset.range
        if (range) reporting.renderItemStats(range, element)
      })
      ui.on('change', 'stats-date-range', () => {
        reporting.renderItemStats('custom')
      })

      ui.registerHideHook(() => {
        reporting.stopAllWatches()
      })

      ui.subscribePage((pageId) => {
        if (pageId === 'historyPage') {
          reporting.watchHistory(new Date())
          void reporting.showHistory()
        }
        if (pageId === 'reportPage') {
          void Promise.all([reporting.generateReport('day'), reporting.renderCalendar()]).then(() => {
            moveSegmentHighlighter(0)
          })
        }
        if (pageId === 'pastHistoryPage') {
          void reporting.renderPublicStats()
        }
        if (pageId === 'itemStatsPage') {
          void reporting.renderItemStats('day')
        }
      })

      context.registerService(POS_REPORTING_SERVICE_KEY, reporting as PosReportingService)
      context.registerService('pos-reporting', reporting)
    },
  }
}
