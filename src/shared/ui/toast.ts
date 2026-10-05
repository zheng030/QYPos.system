import { shallowReactive } from 'vue'

export type ToastOptions = {
  count?: number
}

export type ToastItem = {
  key: string
  text: string
  count: number
  shown: boolean
}

const HIDE_DELAY_MS = 2500
const REMOVE_DELAY_MS = 300

// Messages may carry markup; parse it in an inert document and keep only the text.
function toPlainText(message: string) {
  return new DOMParser().parseFromString(message, 'text/html').body.textContent || ''
}

export function createToastService() {
  const items = shallowReactive<ToastItem[]>([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function replace(key: string, patch: Partial<ToastItem>) {
    const index = items.findIndex((item) => item.key === key)
    if (index >= 0) items.splice(index, 1, { ...items[index], ...patch })
  }

  function show(message: string, options: ToastOptions = {}) {
    const index = items.findIndex((item) => item.key === message)
    const previous = index >= 0 ? items.splice(index, 1)[0] : null
    const count = typeof options.count === 'number' && options.count > 0 ? options.count : (previous?.count || 0) + 1
    items.push({ key: message, text: toPlainText(message), count, shown: previous?.shown || false })
    clearTimeout(timers.get(message))
    requestAnimationFrame(() => replace(message, { shown: true }))
    timers.set(
      message,
      setTimeout(() => {
        replace(message, { shown: false })
        timers.set(
          message,
          setTimeout(() => {
            const target = items.findIndex((item) => item.key === message)
            if (target >= 0) items.splice(target, 1)
            timers.delete(message)
          }, REMOVE_DELAY_MS)
        )
      }, HIDE_DELAY_MS)
    )
  }

  return { items, show }
}

export type ToastService = ReturnType<typeof createToastService>
