import type { AppContext, FeatureRuntime } from '@/app/app-context'
import { bootCheckinApp } from '@/features/checkin/app'

let booted = false

export function createCheckinFeature(context: AppContext): FeatureRuntime {
  return {
    id: 'checkin',
    dependsOn: ['pos-data', 'pos-shell'],
    async boot() {
      if (booted) {
        return
      }

      booted = true
      await bootCheckinApp(context)
    },
  }
}
