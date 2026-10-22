import { computed, shallowRef } from 'vue'

import type { PosLivePendingBatchMap } from '@/features/pos-kernel/types'
import type { SoundPlayer } from '@/shared/ui/sound-player'

import { pendingCardKey } from './runtime-support'

// The restaurant-side new-order sounds of the two delivery apps, each cut to exactly one loop cycle.
export const NEW_ORDER_SOUNDS = {
  foodpanda: { label: 'foodpanda', url: `${import.meta.env.BASE_URL}sounds/foodpanda.mp3` },
  ubereats: { label: 'Uber Eats', url: `${import.meta.env.BASE_URL}sounds/ubereats.mp3` },
}

export type NewOrderSound = keyof typeof NEW_ORDER_SOUNDS

// Muting, volume and sound are per device, so a kitchen tablet can stay quiet while the counter rings.
const MUTED_STORAGE_KEY = 'newOrderBellMuted'
const VOLUME_STORAGE_KEY = 'newOrderBellVolume'
const SOUND_STORAGE_KEY = 'newOrderBellSound'

function normalizeVolume(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 100
}

function storedSound(): NewOrderSound {
  const stored = localStorage.getItem(SOUND_STORAGE_KEY)
  return stored && stored in NEW_ORDER_SOUNDS ? (stored as NewOrderSound) : 'foodpanda'
}

export type NewOrderBell = ReturnType<typeof createNewOrderBell>

// Loops while a customer batch waits that nobody paused, like a delivery tablet: it stops by itself once every
// waiting batch is accepted or returned on any device. 暫停 silences only the batches waiting at that moment.
export function createNewOrderBell(player: SoundPlayer) {
  const enabled = shallowRef(localStorage.getItem(MUTED_STORAGE_KEY) !== 'true')
  const volume = shallowRef(normalizeVolume(Number(localStorage.getItem(VOLUME_STORAGE_KEY) ?? 100)))
  const sound = shallowRef(storedSound())
  player.setVolume(volume.value / 100)
  // Browsers reject audio until the page has been tapped once; the shell then asks staff to tap the bell. It stays
  // set until a play actually starts, so an order arriving meanwhile never shows the bell ringing.
  const blocked = shallowRef(false)
  // Whether the latest play is the order loop or a one-cycle preview.
  const looping = shallowRef(false)
  // The loop playing, or starting: one still blocked does not ring yet.
  const loopOn = computed(() => player.playing.value && looping.value)
  const ringing = computed(() => loopOn.value && !blocked.value)
  const previewing = computed(() => player.playing.value && !looping.value)
  let operation = 0
  // Batches by table and batchId.
  let waiting = new Set<string>()
  const paused = new Set<string>()
  let unlocked = false
  let wakeLock: WakeLockSentinel | null = null

  function shouldRing() {
    return enabled.value && [...waiting].some((key) => !paused.has(key))
  }

  function play(loop: boolean) {
    const current = ++operation
    looping.value = loop
    return player.play(NEW_ORDER_SOUNDS[sound.value].url, { loop }).then(
      () => {
        if (operation === current) blocked.value = false
      },
      () => {
        if (operation === current) blocked.value = true
      }
    )
  }

  function stop() {
    operation++
    blocked.value = false
    player.stop()
  }

  // A blocked loop is retried on the next change, so an unlock or a tap starts it.
  function evaluate() {
    const ring = shouldRing()
    if (ring && !loopOn.value) void play(true)
    else if (!ring && loopOn.value) stop()
  }

  // A locked screen suspends the page, so no order could arrive: a staff device with the bell on stays awake.
  async function keepAwake() {
    if (!unlocked || !enabled.value || document.visibilityState !== 'visible' || (wakeLock && !wakeLock.released)) {
      return
    }
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      if (!enabled.value) releaseWakeLock()
    } catch {
      // Unsupported or refused (low battery): the bell still rings while the screen stays on.
    }
  }

  function releaseWakeLock() {
    void wakeLock?.release()
    wakeLock = null
  }

  // A hidden page loses its wake lock and may have its audio suspended, so coming back restarts both.
  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') return
    if (shouldRing()) void play(true)
    void keepAwake()
  }

  function sync(pendingByTable: PosLivePendingBatchMap) {
    waiting = new Set(
      Object.entries(pendingByTable).flatMap(([table, batches]) =>
        (batches || []).map((batch) => pendingCardKey(table, batch.batchId))
      )
    )
    for (const key of paused) {
      if (!waiting.has(key)) paused.delete(key)
    }
    evaluate()
  }

  function pause() {
    for (const key of waiting) paused.add(key)
    stop()
  }

  async function unlock() {
    try {
      await player.unlock()
    } catch {
      if (enabled.value) blocked.value = true
      return
    }
    blocked.value = false
    if (!unlocked) {
      unlocked = true
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
    evaluate()
    void keepAwake()
  }

  function setEnabled(next: boolean) {
    enabled.value = next
    if (next) {
      localStorage.removeItem(MUTED_STORAGE_KEY)
      evaluate()
      void keepAwake()
    } else {
      localStorage.setItem(MUTED_STORAGE_KEY, 'true')
      stop()
      releaseWakeLock()
    }
  }

  function setVolume(next: number) {
    volume.value = normalizeVolume(next)
    player.setVolume(volume.value / 100)
    localStorage.setItem(VOLUME_STORAGE_KEY, String(volume.value))
  }

  // Choosing a sound plays it: a live loop (or one starting) switches over, otherwise it previews one cycle.
  function setSound(next: NewOrderSound) {
    sound.value = next
    localStorage.setItem(SOUND_STORAGE_KEY, next)
    return play(loopOn.value)
  }

  function preview() {
    if (loopOn.value) return Promise.resolve()
    return play(false)
  }

  function stopPreview() {
    if (previewing.value) stop()
  }

  function dispose() {
    operation++
    document.removeEventListener('visibilitychange', onVisibilityChange)
    releaseWakeLock()
  }

  return {
    enabled,
    volume,
    sound,
    ringing,
    previewing,
    blocked,
    sync,
    pause,
    setEnabled,
    setVolume,
    setSound,
    preview,
    stopPreview,
    unlock,
    dispose,
  }
}
