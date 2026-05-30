declare module '../../../scripts/migrate-rtdb-v3.mjs' {
  export function buildV3Dataset(args: {
    source: Record<string, unknown>
    frontendData: Record<string, unknown>
    migrationId: string
    migratedAt: number
  }): {
    dataset: {
      meta: {
        revisions: {
          reports: {
            dailyByDay: Record<string, number>
            itemStatsByDay: Record<string, number>
          }
        }
      }
      live: {
        tables: Record<
          string,
          {
            summary: { displaySeqBase?: number | null } | null
            cart: Record<string, unknown>
            incomingOrders: Record<string, { requestId?: string }>
          }
        >
      }
      reports: {
        dailyByMonth: Record<string, Record<string, { paidTotal?: number }>>
        itemStatsByMonth: Record<string, Record<string, Record<string, { revenue?: number }>>>
      }
    }
    warnings: unknown[]
  }
}
