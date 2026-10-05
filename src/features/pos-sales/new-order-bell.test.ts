// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

import type { PosOrderBatch } from '@/features/pos-kernel/types'

import { createNewOrderBell } from './new-order-bell'

function pending(...batchIds: string[]) {
  return batchIds.map((batchId) => ({ batchId }) as PosOrderBatch)
}

function createBell() {
  const play = vi.fn(async () => {})
  const stop = vi.fn()
  const unlock = vi.fn(async () => {})
  const setVolume = vi.fn()
  const dispose = vi.fn(async () => {})
  return {
    play,
    stop,
    unlock,
    setVolume,
    dispose,
    bell: createNewOrderBell({ play, stop, unlock, setVolume, dispose, playing: shallowRef(false) }),
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('new order bell', () => {
  it('defaults to full volume and remembers volume independently from muting', () => {
    const { bell, setVolume } = createBell()
    expect(bell.volume.value).toBe(100)
    expect(setVolume).toHaveBeenCalledWith(1)
    bell.setVolume(35)
    expect(setVolume).toHaveBeenLastCalledWith(0.35)
    bell.setEnabled(false)
    const reopened = createBell()
    expect(reopened.bell.volume.value).toBe(35)
    expect(reopened.setVolume).toHaveBeenCalledWith(0.35)
    reopened.bell.setEnabled(true)
    reopened.bell.setVolume(0)
    expect(reopened.bell.enabled.value).toBe(true)
    expect(reopened.setVolume).toHaveBeenLastCalledWith(0)
  })

  it('rings once per batch that starts waiting, across tables', () => {
    const { play, bell } = createBell()

    bell.sync({})
    expect(play).not.toHaveBeenCalled()

    bell.sync({ '01桌': pending('b1') })
    expect(play).toHaveBeenCalledTimes(1)

    // Another table's update re-sends the batch that is already waiting.
    bell.sync({ '01桌': pending('b1'), '02桌': undefined })
    expect(play).toHaveBeenCalledTimes(1)

    bell.sync({ '01桌': pending('b1'), '02桌': pending('b2') })
    expect(play).toHaveBeenCalledTimes(2)

    // Accepting b1 leaves only b2 waiting: nothing new, no ring.
    bell.sync({ '02桌': pending('b2') })
    expect(play).toHaveBeenCalledTimes(2)

    bell.sync({ '02桌': pending('b2', 'b3') })
    expect(play).toHaveBeenCalledTimes(3)
  })

  it('stays silent while muted and remembers the choice on this device', () => {
    const { play, bell } = createBell()

    bell.setEnabled(false)
    bell.sync({ '01桌': pending('b1') })
    expect(play).not.toHaveBeenCalled()
    expect(createBell().bell.enabled.value).toBe(false)

    // Batches seen while muted do not ring later on.
    bell.setEnabled(true)
    bell.sync({ '01桌': pending('b1') })
    expect(play).not.toHaveBeenCalled()
    expect(createBell().bell.enabled.value).toBe(true)
  })

  it('exposes blocked playback and clears it on a successful manual retry', async () => {
    const { play, bell } = createBell()
    play.mockImplementationOnce(async () => {
      throw new DOMException('play() needs a user gesture', 'NotAllowedError')
    })

    bell.sync({ '01桌': pending('b1') })
    await Promise.resolve()
    expect(bell.blocked.value).toBe(true)
    await bell.preview()

    expect(play).toHaveBeenCalledTimes(2)
    expect(bell.blocked.value).toBe(false)
  })

  it('stops this reminder without muting or forgetting existing batches', () => {
    const { play, stop, bell } = createBell()
    bell.sync({ '01桌': pending('b1') })
    bell.stop()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(bell.enabled.value).toBe(true)
    bell.sync({ '01桌': pending('b1') })
    expect(play).toHaveBeenCalledTimes(1)
    bell.sync({ '01桌': pending('b1', 'b2') })
    expect(play).toHaveBeenCalledTimes(2)
    bell.setEnabled(false)
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('ignores a late playback failure after stopping', async () => {
    const { play, bell } = createBell()
    let reject!: (error: Error) => void
    play.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        })
    )
    bell.sync({ '01桌': pending('b1') })
    bell.stop()
    reject(new Error('interrupted'))
    await Promise.resolve()
    expect(bell.blocked.value).toBe(false)
  })
})
