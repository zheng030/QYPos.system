import { shallowRef } from 'vue'

import type { PosLivePendingBatchMap } from '@/features/pos-kernel/types'
import type { SoundPlayer } from '@/shared/ui/sound-player'

// Swap the file in public/sounds/ to change the ringtone; keep the name.
export const NEW_ORDER_SOUND_URL = `${import.meta.env.BASE_URL}sounds/new-order.mp3`

// Muting is per device, so a kitchen tablet can stay quiet while the counter rings.
const MUTED_STORAGE_KEY = 'newOrderBellMuted'
const VOLUME_STORAGE_KEY = 'newOrderBellVolume'

function normalizeVolume(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 100
}

export type NewOrderBell = ReturnType<typeof createNewOrderBell>

export function createNewOrderBell(sound: SoundPlayer) {
  const enabled = shallowRef(localStorage.getItem(MUTED_STORAGE_KEY) !== 'true')
  const volume = shallowRef(normalizeVolume(Number(localStorage.getItem(VOLUME_STORAGE_KEY) ?? 100)))
  sound.setVolume(volume.value / 100)
  const blocked = shallowRef(false)
  let operation = 0
  let waitingBatchIds = new Set<string>()

  function ring() {
    const current = ++operation
    blocked.value = false
    return sound.play().catch(() => {
      if (operation === current) blocked.value = true
    })
  }

  function unlock() {
    const current = ++operation
    return sound.unlock().catch(() => {
      if (operation === current && enabled.value) blocked.value = true
    })
  }

  function stop() {
    operation++
    blocked.value = false
    sound.stop()
  }

  function setVolume(next: number) {
    volume.value = normalizeVolume(next)
    sound.setVolume(volume.value / 100)
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume.value))
  }

  function dispose() {
    operation++
    blocked.value = false
    return sound.dispose()
  }

  // Rings once for every customer batch that starts waiting; batches already waiting stay silent.
  function sync(pendingByTable: PosLivePendingBatchMap) {
    const next = new Set(
      Object.values(pendingByTable).flatMap((batches) => (batches || []).map((batch) => batch.batchId))
    )
    const hasNew = [...next].some((batchId) => !waitingBatchIds.has(batchId))
    waitingBatchIds = next
    if (hasNew && enabled.value) {
      ring()
    }
  }

  function setEnabled(next: boolean) {
    enabled.value = next
    if (next) {
      localStorage.removeItem(MUTED_STORAGE_KEY)
    } else {
      localStorage.setItem(MUTED_STORAGE_KEY, 'true')
      stop()
    }
  }

  return {
    enabled,
    volume,
    playing: sound.playing,
    blocked,
    sync,
    setEnabled,
    setVolume,
    unlock,
    stop,
    dispose,
    preview: ring,
  }
}
