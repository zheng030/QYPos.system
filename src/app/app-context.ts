export type FeatureRuntime = {
  id: string
  dependsOn?: string[]
  boot(): void | Promise<void>
}

export type AppContext = {
  root: HTMLElement
  registerService<T>(key: string, service: T): () => void
  getService<T>(key: string): T | null
}

export function createAppContext(root: HTMLElement): AppContext {
  const services = new Map<string, unknown>()

  return {
    root,
    registerService<T>(key: string, service: T) {
      services.set(key, service)
      return () => {
        if (services.get(key) === service) {
          services.delete(key)
        }
      }
    },
    getService<T>(key: string) {
      return (services.get(key) as T | undefined) ?? null
    },
  }
}
