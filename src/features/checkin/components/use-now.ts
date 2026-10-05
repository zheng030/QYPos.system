import { onBeforeUnmount, onMounted, shallowRef } from 'vue'

// A wall clock that only ticks while the component that shows it is mounted.
export function useNow(intervalMs = 1000) {
  const now = shallowRef(new Date())
  let timer: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    timer = setInterval(() => {
      now.value = new Date()
    }, intervalMs)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })
  return now
}
