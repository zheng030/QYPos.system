import { createAppContext } from '@/app/app-context'
import { createFeatureRegistry } from '@/app/feature-registry'

export function bootstrapApp() {
  const root = document.getElementById('app-root')
  if (!root) {
    throw new Error('Missing #app-root mount element')
  }

  document.body.setAttribute('ontouchstart', '')

  const context = createAppContext(root)
  const registry = createFeatureRegistry(context)
  void registry.registerAll()
}
