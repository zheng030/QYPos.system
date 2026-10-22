import { vi } from 'vitest'

export type MockSource = {
  buffer: { url: string } | null
  loop: boolean
  onended: (() => void) | null
  ended: boolean
  // The browser finishing a one-shot.
  end(): void
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

// happy-dom has no Web Audio. Each decoded buffer carries its URL, so a test can tell which sound plays.
export function mockAudioContext() {
  const sources: MockSource[] = []
  const gains: ReturnType<typeof createGain>[] = []
  function createGain() {
    return {
      gain: {
        value: 1,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
  }
  const context = {
    state: 'suspended' as AudioContextState,
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running'
    }),
    close: vi.fn(async () => {
      context.state = 'closed'
    }),
    createGain: vi.fn(() => {
      const gain = createGain()
      gains.push(gain)
      return gain
    }),
    createBuffer: vi.fn(() => ({ url: '' })),
    createBufferSource: vi.fn(() => {
      const source: MockSource = {
        buffer: null,
        loop: false,
        onended: null,
        ended: false,
        end() {
          source.ended = true
          source.onended?.()
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(() => {
          source.ended = true
        }),
      }
      sources.push(source)
      return source
    }),
    decodeAudioData: vi.fn(async (data: string) => ({ url: data })),
  }
  const createContext = vi.fn(
    class {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: every test reads and drives this one context
        return context
      }
    }
  )
  vi.stubGlobal('AudioContext', createContext)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ arrayBuffer: async () => url }))
  )
  // The sources that played a sound, without the silent unlock frames.
  const played = () => sources.filter((source) => source.buffer?.url && source.start.mock.calls.length > 0)
  // What sounds now, as { url, loop }.
  const sounding = () =>
    played()
      .filter((source) => !source.ended)
      .map((source) => ({ url: source.buffer?.url, loop: source.loop }))
  return { createContext, context, gains, sources, played, sounding }
}
