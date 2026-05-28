import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { createCheckinFeature } from '@/features/checkin/runtime'
import { createPosAdminFeature } from '@/features/pos-admin/runtime'
import { createPosDataFeature } from '@/features/pos-data/runtime'
import { createPosKernelFeature } from '@/features/pos-kernel/runtime'
import { createPosReportingFeature } from '@/features/pos-reporting/runtime'
import { createPosSalesFeature } from '@/features/pos-sales/runtime'
import { createPosShellFeature } from '@/features/pos-shell/runtime'

export function createFeatureRegistry(context: AppContext) {
  const features: FeatureRuntime[] = [
    createPosKernelFeature(context),
    createPosDataFeature(context),
    createPosShellFeature(context),
    createPosSalesFeature(context),
    createPosReportingFeature(context),
    createPosAdminFeature(context),
    createCheckinFeature(context),
  ]

  function sortFeatures(items: FeatureRuntime[]) {
    const byId = new Map(items.map((feature) => [feature.id, feature]))
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const ordered: FeatureRuntime[] = []

    function visit(feature: FeatureRuntime) {
      if (visited.has(feature.id)) {
        return
      }
      if (visiting.has(feature.id)) {
        throw new Error(`Feature dependency cycle detected at ${feature.id}`)
      }

      visiting.add(feature.id)
      feature.dependsOn?.forEach((dependencyId) => {
        const dependency = byId.get(dependencyId)
        if (!dependency) {
          throw new Error(`Missing feature dependency: ${feature.id} -> ${dependencyId}`)
        }
        visit(dependency)
      })
      visiting.delete(feature.id)
      visited.add(feature.id)
      ordered.push(feature)
    }

    items.forEach(visit)
    return ordered
  }

  const orderedFeatures = sortFeatures(features)

  return {
    async registerAll() {
      for (const feature of orderedFeatures) {
        await feature.boot()
      }
    },
  }
}
