import { vi } from 'vitest'

export function mockAudioContext() {
  const gain = {
    gain: {
      value: 1,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }
  const source = { connect: vi.fn() }
  const context = {
    currentTime: 0,
    destination: {},
    createGain: vi.fn(() => gain),
    createMediaElementSource: vi.fn(() => source),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  }
  const createContext = vi.fn(
    class {
      constructor() {
        Object.assign(this, context)
      }
    }
  )
  vi.stubGlobal('AudioContext', createContext)
  return { createContext, context, gain, source }
}
