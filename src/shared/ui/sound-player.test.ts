// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSoundOutput } from './sound-player'
import { mockAudioContext } from './sound-player.test-support'

let audio: ReturnType<typeof mockAudioContext>

beforeEach(() => {
  audio = mockAudioContext()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sound output', () => {
  it('unlocks inside the gesture: resumes, starts a silent frame and plays back through the iOS silent switch', async () => {
    const session = { type: 'auto' }
    vi.stubGlobal('navigator', { ...navigator, audioSession: session })
    const player = createSoundOutput().createPlayer()
    const unlocking = player.unlock()
    expect(audio.context.resume).toHaveBeenCalledTimes(1)
    expect(audio.sources).toHaveLength(1)
    expect(audio.sources[0].start).toHaveBeenCalledTimes(1)
    expect(session.type).toBe('playback')
    await unlocking
    expect(audio.played()).toEqual([])
    expect(player.playing.value).toBe(false)
  })

  it('loops a decoded buffer until stopped and decodes each sound once', async () => {
    const player = createSoundOutput().createPlayer()
    await player.play('/a.mp3', { loop: true })
    const [loop] = audio.played()
    expect(loop.loop).toBe(true)
    expect(loop.buffer?.url).toBe('/a.mp3')
    expect(loop.connect).toHaveBeenCalledWith(audio.gains[0])
    expect(audio.gains[0].connect).toHaveBeenCalledWith(audio.context.destination)
    expect(player.playing.value).toBe(true)

    // Switching stops the running loop first.
    await player.play('/b.mp3', { loop: true })
    expect(loop.stop).toHaveBeenCalledTimes(1)
    expect(audio.played().map((source) => source.buffer?.url)).toEqual(['/a.mp3', '/b.mp3'])
    player.stop()
    expect(audio.played()[1].stop).toHaveBeenCalledTimes(1)
    expect(player.playing.value).toBe(false)

    await player.play('/a.mp3')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(audio.context.decodeAudioData).toHaveBeenCalledTimes(2)
  })

  it('ends a one-shot by itself, ignoring the end of a replaced source', async () => {
    const player = createSoundOutput().createPlayer()
    await player.play('/a.mp3')
    const first = audio.played()[0]
    expect(first.loop).toBe(false)
    await player.play('/a.mp3')
    first.end()
    expect(player.playing.value).toBe(true)
    audio.played()[1].end()
    expect(player.playing.value).toBe(false)
  })

  it('starts nothing when stopped while the sound still loads', async () => {
    const player = createSoundOutput().createPlayer()
    const playing = player.play('/a.mp3', { loop: true })
    expect(player.playing.value).toBe(true)
    player.stop()
    await playing
    expect(audio.played()).toEqual([])
    expect(player.playing.value).toBe(false)
  })

  it('rejects while the browser keeps the context suspended', async () => {
    audio.context.resume.mockResolvedValueOnce(undefined)
    const player = createSoundOutput().createPlayer()
    await expect(player.play('/a.mp3', { loop: true })).rejects.toThrow('tap')
    expect(audio.played()).toEqual([])
    expect(player.playing.value).toBe(false)
  })

  it('gives each player its own volume on one shared context', async () => {
    const output = createSoundOutput()
    const bell = output.createPlayer()
    const chime = output.createPlayer()
    bell.setVolume(0.35)
    expect(audio.createContext).not.toHaveBeenCalled()
    await bell.play('/a.mp3', { loop: true })
    await chime.play('/b.mp3')
    expect(audio.createContext).toHaveBeenCalledTimes(1)
    expect(audio.gains.map((gain) => gain.gain.value)).toEqual([0.35, 1])
    // A short ramp, so changing the volume while it rings does not click or restart it.
    bell.setVolume(0.8)
    expect(audio.gains[0].gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.8, 0.02)
    expect(audio.played()).toHaveLength(2)
  })

  it('stops every player and closes the shared context once on disposal', async () => {
    const output = createSoundOutput()
    const bell = output.createPlayer()
    const chime = output.createPlayer()
    await bell.play('/a.mp3', { loop: true })
    await chime.play('/b.mp3')
    await output.dispose()
    expect(bell.playing.value).toBe(false)
    expect(chime.playing.value).toBe(false)
    expect(audio.played().every((source) => source.stop.mock.calls.length === 1)).toBe(true)
    expect(audio.context.close).toHaveBeenCalledTimes(1)
  })
})
