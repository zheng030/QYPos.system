import { createRtdbV3RepositoryAttendanceModule } from './rtdb-v3-repository-attendance'
import { createRtdbV3RepositoryCatalogModule } from './rtdb-v3-repository-catalog'
import { createRtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import { createRtdbV3RepositoryHistoryModule } from './rtdb-v3-repository-history'
import { createRtdbV3RepositoryLiveModule } from './rtdb-v3-repository-live'
import { createRtdbV3RepositorySettingsModule } from './rtdb-v3-repository-settings'

export { createRtdbV3RepositoryContext } from './rtdb-v3-repository-context'

export function createRtdbV3Repository(deps: Parameters<typeof createRtdbV3RepositoryContext>[0]) {
  const ctx = createRtdbV3RepositoryContext(deps)
  const catalog = createRtdbV3RepositoryCatalogModule(ctx)
  const attendance = createRtdbV3RepositoryAttendanceModule(ctx, {
    fetchAttendanceEmployees: catalog.fetchAttendanceEmployees,
  })
  const history = createRtdbV3RepositoryHistoryModule(ctx)
  const live = createRtdbV3RepositoryLiveModule(ctx, {
    rebuildDayReports: history.rebuildDayReports,
  })
  const settings = createRtdbV3RepositorySettingsModule(ctx)

  return {
    ...attendance,
    ...catalog,
    ...history,
    ...live,
    ...settings,
  }
}
