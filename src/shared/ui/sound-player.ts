import { type Ref, readonly, shallowRef } from 'vue'

export type SoundPlayer = {
  playing: Readonly<Ref<boolean>>
  setVolume(volume: number): void
  unlock(): Promise<void>
  play(): Promise<void>
  stop(): void
  dispose(): Promise<void>
}

// Unlock and playback share one element because browser permissions are per media element.
export function createSoundPlayer(src: string): SoundPlayer {
  let output: { element: HTMLAudioElement; context: AudioContext; gain: GainNode } | null = null
  let volume = 1
  let operation = 0
  const playing = shallowRef(false)

  function getOutput() {
    if (!output) {
      const element = new Audio(src)
      const context = new AudioContext()
      const gain = context.createGain()
      gain.gain.value = volume
      context.createMediaElementSource(element).connect(gain)
      gain.connect(context.destination)
      output = { element, context, gain }
      element.addEventListener('ended', () => {
        if (output?.element.ended) playing.value = false
      })
      element.addEventListener('pause', () => {
        if (output?.element.paused) playing.value = false
      })
    }
    return output
  }

  function stop() {
    operation++
    if (output) {
      output.element.pause()
      output.element.currentTime = 0
      output.element.muted = false
    }
    playing.value = false
  }

  return {
    playing: readonly(playing),
    setVolume(next) {
      volume = Math.min(1, Math.max(0, next))
      if (!output) return
      const { context, gain } = output
      const currentGain = gain.gain.value
      const now = context.currentTime
      // A short ramp avoids clicks when adjusting the volume during playback.
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(currentGain, now)
      gain.gain.linearRampToValueAtTime(volume, now + 0.02)
    },
    async unlock() {
      const current = ++operation
      const { element, context } = getOutput()
      element.muted = true
      try {
        // Resume and play synchronously inside the staff gesture, before any network awaits.
        await Promise.all([context.resume(), element.play()])
      } finally {
        if (operation === current) {
          element.pause()
          element.currentTime = 0
          element.muted = false
        }
      }
    },
    async play() {
      const current = ++operation
      const { element, context } = getOutput()
      element.muted = false
      element.currentTime = 0
      playing.value = true
      try {
        await Promise.all([context.resume(), element.play()])
      } catch (error) {
        if (operation === current) stop()
        throw error
      }
    },
    stop,
    async dispose() {
      stop()
      const previous = output
      output = null
      await previous?.context.close()
    },
  }
}
