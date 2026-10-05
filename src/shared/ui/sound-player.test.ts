// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSoundPlayer } from './sound-player'
import { mockAudioContext } from './sound-player.test-support'

let audioContext: ReturnType<typeof mockAudioContext>

beforeEach(() => {
  audioContext = mockAudioContext()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('sound player', () => {
  it('silently unlocks and reuses one element for restarts, stop and media completion', async () => {
    const muted: boolean[] = []
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      muted.push(this.muted)
      return Promise.resolve()
    })
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const sound = createSoundPlayer('/sounds/new-order.mp3')
    await sound.unlock()
    expect(muted).toEqual([true])
    expect(sound.playing.value).toBe(false)
    expect(pause).toHaveBeenCalledTimes(1)
    await sound.play()
    const element = play.mock.contexts[0] as HTMLAudioElement
    element.currentTime = 8
    await sound.play()
    expect(play.mock.contexts.every((context) => context === element)).toBe(true)
    expect(element.currentTime).toBe(0)
    expect(audioContext.createContext).toHaveBeenCalledTimes(1)
    expect(audioContext.context.createMediaElementSource).toHaveBeenCalledExactlyOnceWith(element)
    expect(audioContext.source.connect).toHaveBeenCalledWith(audioContext.gain)
    expect(audioContext.gain.connect).toHaveBeenCalledWith(audioContext.context.destination)
    expect(muted).toEqual([true, false, false])
    expect(sound.playing.value).toBe(true)
    Object.defineProperty(element, 'ended', { value: true, configurable: true })
    element.dispatchEvent(new Event('ended'))
    expect(sound.playing.value).toBe(false)
    await sound.play()
    element.dispatchEvent(new Event('pause'))
    expect(sound.playing.value).toBe(false)
    await sound.play()
    sound.stop()
    expect(sound.playing.value).toBe(false)
    expect(element.currentTime).toBe(0)
  })

  it('does not pause a newer reminder when silent unlock resolves late', async () => {
    let resolve!: () => void
    vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementationOnce(
        () =>
          new Promise<void>((done) => {
            resolve = done
          })
      )
      .mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const sound = createSoundPlayer('/sound.mp3')
    const unlocking = sound.unlock()
    await sound.play()
    resolve()
    await unlocking
    expect(pause).not.toHaveBeenCalled()
    expect(sound.playing.value).toBe(true)
  })

  it('does not revive stopped playback when play resolves late', async () => {
    let resolve!: () => void
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done
        })
    )
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const sound = createSoundPlayer('/sound.mp3')
    const playback = sound.play()
    sound.stop()
    resolve()
    await playback
    expect(sound.playing.value).toBe(false)
  })

  it('ignores a queued pause event from a previous stop after replay starts', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: false, configurable: true })
      return Promise.resolve()
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true })
    })
    const sound = createSoundPlayer('/sound.mp3')
    await sound.play()
    sound.stop()
    await sound.play()
    const element = play.mock.contexts[0] as HTMLAudioElement
    element.dispatchEvent(new Event('pause'))
    expect(sound.playing.value).toBe(true)
  })

  it('applies the saved volume lazily and changes gain during playback without restarting', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const sound = createSoundPlayer('/sound.mp3')
    sound.setVolume(0.35)
    expect(audioContext.createContext).not.toHaveBeenCalled()
    await sound.play()
    expect(audioContext.gain.gain.value).toBe(0.35)
    sound.setVolume(0)
    expect(audioContext.gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.02)
    sound.setVolume(0.8)
    expect(audioContext.gain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.8, 0.02)
    expect(play).toHaveBeenCalledTimes(1)
    expect(sound.playing.value).toBe(true)
    expect((play.mock.contexts[0] as HTMLAudioElement).volume).toBe(1)
  })

  it('resumes the context and plays synchronously inside the unlocking gesture', async () => {
    let resolve!: () => void
    audioContext.context.resume.mockImplementationOnce(
      () =>
        new Promise<void>((done) => {
          resolve = done
        })
    )
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const sound = createSoundPlayer('/sound.mp3')
    const unlocking = sound.unlock()
    expect(audioContext.context.resume).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledTimes(1)
    await sound.play()
    resolve()
    await unlocking
    expect(pause).not.toHaveBeenCalled()
    expect(sound.playing.value).toBe(true)
  })

  it('stops playback when the audio context cannot resume', async () => {
    audioContext.context.resume.mockRejectedValueOnce(new Error('context blocked'))
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const sound = createSoundPlayer('/sound.mp3')
    await expect(sound.play()).rejects.toThrow('context blocked')
    expect(sound.playing.value).toBe(false)
    expect(pause).toHaveBeenCalledTimes(1)
  })

  it('stops and closes its audio context on disposal', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const sound = createSoundPlayer('/sound.mp3')
    await sound.play()
    await sound.dispose()
    expect(pause).toHaveBeenCalledTimes(1)
    expect(sound.playing.value).toBe(false)
    expect(audioContext.context.close).toHaveBeenCalledTimes(1)
  })
})
