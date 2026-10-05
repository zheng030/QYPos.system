import { watchEffect } from 'vue'

// Body-level mode classes drive page-wide CSS; apply them synchronously so code that reads the class
// right after a state change (printing, tests) sees the new value.
export function bindBodyClass(className: string, isActive: () => boolean) {
  return watchEffect(
    () => {
      document.body.classList.toggle(className, isActive())
    },
    { flush: 'sync' }
  )
}
