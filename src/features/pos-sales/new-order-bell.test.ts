// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PosOrderBatch } from '@/features/pos-kernel/types'
import { createSoundOutput } from '@/shared/ui/sound-player'
import { mockAudioContext } from '@/shared/ui/sound-player.test-support'

import { createNewOrderBell, NEW_ORDER_SOUNDS } from './new-order-bell'

const FOODPANDA = NEW_ORDER_SOUNDS.foodpanda.url
const UBEREATS = NEW_ORDER_SOUNDS.ubereats.url

function pending(...batchIds: string[]) {
  return batchIds.map((batchId) => ({ batchId }) as PosOrderBatch)
}

let audio: ReturnType<typeof mockAudioContext>

function createBell() {
  return createNewOrderBell(createSoundOutput().createPlayer())
}

function sounding() {
  return audio.sounding()
}

beforeEach(() => {
  localStorage.clear()
  audio = mockAudioContext()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('new order bell', () => {
  it('remembers the volume and the sound on this device, independently from muting', async () => {
    const bell = createBell()
    expect(bell.volume.value).toBe(100)
    expect(bell.sound.value).toBe('foodpanda')
    bell.setVolume(35)
    bell.setEnabled(false)
    await bell.setSound('ubereats')

    const reopened = createBell()
    expect(reopened.volume.value).toBe(35)
    expect(reopened.sound.value).toBe('ubereats')
    expect(reopened.enabled.value).toBe(false)
    await reopened.preview()
    expect(audio.gains.at(-1)?.gain.value).toBe(0.35)
  })

  it('loops while a batch waits on any table and stops when nothing waits', async () => {
    const bell = createBell()
    bell.sync({})
    await flushPromises()
    expect(sounding()).toEqual([])

    bell.sync({ '01桌': pending('b1') })
    await flushPromises()
    expect(sounding()).toEqual([{ url: FOODPANDA, loop: true }])
    expect(bell.ringing.value).toBe(true)

    // Another table's update re-sends the batch that is already waiting: the loop goes on, not restarts.
    bell.sync({ '01桌': pending('b1'), '02桌': pending('b2') })
    await flushPromises()
    expect(audio.played()).toHaveLength(1)

    // Accepting one of two keeps ringing for the other.
    bell.sync({ '02桌': pending('b2') })
    await flushPromises()
    expect(sounding()).toEqual([{ url: FOODPANDA, loop: true }])

    bell.sync({ '02桌': undefined })
    expect(sounding()).toEqual([])
    expect(bell.ringing.value).toBe(false)
  })

  it('pauses the batches waiting now, and rings again for a new one', async () => {
    const bell = createBell()
    bell.sync({ '01桌': pending('b1') })
    await flushPromises()
    bell.pause()
    expect(sounding()).toEqual([])
    expect(bell.enabled.value).toBe(true)

    bell.sync({ '01桌': pending('b1') })
    await flushPromises()
    expect(sounding()).toEqual([])

    bell.sync({ '01桌': pending('b1'), '02桌': pending('b2') })
    await flushPromises()
    expect(sounding()).toEqual([{ url: FOODPANDA, loop: true }])

    // Pausing again and accepting b2 leaves only paused b1: still silent.
    bell.pause()
    bell.sync({ '01桌': pending('b1') })
    await flushPromises()
    expect(sounding()).toEqual([])
  })

  it('never rings while muted, and rings at once when turned back on with an order waiting', async () => {
    const bell = createBell()
    bell.setEnabled(false)
    bell.sync({ '01桌': pending('b1') })
    await flushPromises()
    expect(sounding()).toEqual([])

    bell.setEnabled(true)
    await flushPromises()
    expect(sounding()).toEqual([{ url: FOODPANDA, loop: true }])
    bell.setEnabled(false)
    expect(sounding()).toEqual([])
  })

  it('switches a live loop to the chosen sound, and otherwise plays one cycle', async () => {
    const bell = createBell()
    await bell.setSound('ubereats')
    expect(sounding()).toEqual([{ url: UBEREATS, loop: false }])
    expect(bell.previewing.value).toBe(true)
    audio.played()[0].end()
    expect(bell.previewing.value).toBe(false)

    bell.sync({ '01桌': pending('b1') })
    await flushPromises()
    await bell.setSound('foodpanda')
    expect(sounding()).toEqual([{ url: FOODPANDA, loop: true }])
    expect(bell.ringing.value).toBe(true)

    // 試聽 does nothing while it rings.
    await bell.preview()
    expect(audio.played()).toHaveLength(3)
  })

  it('stops a preview without touching the bell', async () => {
    const bell = createBell()
    await bell.preview()
    expect(sounding()).toEqual([{ url: FOODPANDA, loop: false }])
    bell.stopPreview()
    expect(sounding()).toEqual([])
    expect(bell.previewing.value).toBe(false)
    expect(bell.enabled.value).toBe(true)
  })

  it('sets blocked when the browser rejects playback, and the unlock starts the loop for orders already waiting', async () => {
    const bell = createBell()
    audio.context.resume.mockResolvedValueOnce(undefined)
    bell.sync({ '01桌': pending('b1') })
    await flushPromises()
    expect(bell.blocked.value).toBe(true)
    expect(bell.ringing.value).toBe(false)

    await bell.unlock()
    await flushPromises()
    expect(bell.blocked.value).toBe(false)
    expect(sounding()).toEqual([{ url: FOODPANDA, loop: true }])
    bell.dispose()
  })

  it('keeps asking for a tap while the browser still blocks audio: a new order never shows the bell ringing', async () => {
    vi.useFakeTimers()
    try {
      const bell = createBell()
      // The browser leaves resume() pending until the page is tapped.
      audio.context.resume.mockImplementation(() => new Promise(() => {}))
      bell.sync({ '01桌': pending('b1') })
      await vi.advanceTimersByTimeAsync(600)
      expect(bell.blocked.value).toBe(true)

      bell.sync({ '01桌': pending('b1'), '02桌': pending('b2') })
      await vi.advanceTimersByTimeAsync(100)
      expect(bell.ringing.value).toBe(false)
      expect(bell.blocked.value).toBe(true)

      // A tap meanwhile lets the loop start.
      audio.context.resume.mockImplementation(async () => {
        audio.context.state = 'running'
      })
      await bell.unlock()
      await vi.advanceTimersByTimeAsync(500)
      expect(sounding()).toEqual([{ url: FOODPANDA, loop: true }])
      expect(bell.ringing.value).toBe(true)
      bell.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a playback failure that comes after the bell stopped', async () => {
    const bell = createBell()
    audio.context.resume.mockResolvedValueOnce(undefined)
    bell.sync({ '01桌': pending('b1') })
    // Accepted on another device before the browser said no.
    bell.sync({})
    await flushPromises()

    expect(bell.blocked.value).toBe(false)
  })

  it('keeps the screen awake while on, and restarts the loop when the page shows again', async () => {
    const release = vi.fn(async () => {})
    const request = vi.fn(async () => ({ released: false, release }))
    vi.stubGlobal('navigator', { wakeLock: { request } })
    const bell = createBell()
    await bell.unlock()
    expect(request).toHaveBeenCalledExactlyOnceWith('screen')

    bell.sync({ '01桌': pending('b1') })
    await flushPromises()
    // The OS suspended the audio while the page was hidden.
    audio.context.state = 'suspended'
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(audio.played()).toHaveLength(2)
    expect(sounding()).toEqual([{ url: FOODPANDA, loop: true }])

    audio.context.state = 'suspended'
    audio.context.resume.mockResolvedValueOnce(undefined)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(bell.blocked.value).toBe(true)

    bell.setEnabled(false)
    expect(release).toHaveBeenCalledTimes(1)
    bell.dispose()
  })
})
