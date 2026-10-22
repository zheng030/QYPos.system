import { type Ref, readonly, shallowRef } from 'vue'

export type SoundPlayer = {
  playing: Readonly<Ref<boolean>>
  setVolume(volume: number): void
  unlock(): Promise<void>
  play(url: string, options?: { loop?: boolean }): Promise<void>
  stop(): void
}

// A blocked context's resume() can stay pending until the next gesture, so playback gives up after a moment.
const RESUME_TIMEOUT_MS = 500

async function resume(context: AudioContext) {
  if (context.state !== 'running') {
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([context.resume(), new Promise((done) => (timer = setTimeout(done, RESUME_TIMEOUT_MS)))])
    clearTimeout(timer)
  }
  if (context.state !== 'running') throw new DOMException('Audio needs a tap on the page first', 'NotAllowedError')
}

// One AudioContext for the whole app: the browser unlocks it once, and every bell plays decoded buffers through
// it, so a loop wraps sample-accurately and switching sounds needs no new permission.
export function createSoundOutput() {
  let context: AudioContext | null = null
  const buffers = new Map<string, Promise<AudioBuffer>>()
  const players = new Set<SoundPlayer>()

  function getContext() {
    context ??= new AudioContext()
    return context
  }

  function load(url: string) {
    let buffer = buffers.get(url)
    if (!buffer) {
      buffer = fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => getContext().decodeAudioData(data))
      // A failed download is fetched again on the next play.
      buffer.catch(() => buffers.delete(url))
      buffers.set(url, buffer)
    }
    return buffer
  }

  // Runs inside the staff gesture: resume and start a silent frame synchronously, before any await.
  function unlock() {
    const audio = getContext()
    // iOS mutes Web Audio under the ringer's silent switch unless the session plays back like media.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'playback'
    const silence = audio.createBufferSource()
    silence.buffer = audio.createBuffer(1, 1, audio.sampleRate)
    silence.connect(audio.destination)
    silence.start()
    return resume(audio)
  }

  function createPlayer(): SoundPlayer {
    let gain: GainNode | null = null
    let source: AudioBufferSourceNode | null = null
    let volume = 1
    let operation = 0
    const playing = shallowRef(false)

    function getGain(audio: AudioContext) {
      if (!gain) {
        gain = audio.createGain()
        gain.gain.value = volume
        gain.connect(audio.destination)
      }
      return gain
    }

    function stop() {
      operation++
      const previous = source
      source = null
      previous?.stop()
      playing.value = false
    }

    const player: SoundPlayer = {
      playing: readonly(playing),
      setVolume(next) {
        volume = Math.min(1, Math.max(0, next))
        if (!gain || !context) return
        const now = context.currentTime
        // A short ramp avoids clicks when adjusting the volume during playback.
        gain.gain.cancelScheduledValues(now)
        gain.gain.setValueAtTime(gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(volume, now + 0.02)
      },
      unlock,
      async play(url, { loop = false } = {}) {
        stop()
        const current = operation
        playing.value = true
        const audio = getContext()
        try {
          const [buffer] = await Promise.all([load(url), resume(audio)])
          if (operation !== current) return
          const node = audio.createBufferSource()
          node.buffer = buffer
          node.loop = loop
          node.connect(getGain(audio))
          node.onended = () => {
            if (source !== node) return
            source = null
            playing.value = false
          }
          node.start()
          source = node
        } catch (error) {
          if (operation === current) playing.value = false
          throw error
        }
      },
      stop,
    }
    players.add(player)
    return player
  }

  return {
    createPlayer,
    async dispose() {
      for (const player of players) player.stop()
      const previous = context
      context = null
      buffers.clear()
      await previous?.close()
    },
  }
}
