const DEFAULT_TOKEN_LENGTH = 8
const MAIN_LINE_ID = 'm'
const CHILD_LINE_PREFIX = 'c'
const BASE36_RADIX = 36
const BASE36_INDEX_WIDTH = 2

function randomBase36Chunk() {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(8)
    globalThis.crypto.getRandomValues(bytes)
    let value = 0n
    for (const byte of bytes) {
      value = (value << 8n) | BigInt(byte)
    }
    return value.toString(BASE36_RADIX)
  }

  return Math.random().toString(BASE36_RADIX).slice(2)
}

function createOpaqueToken(length = DEFAULT_TOKEN_LENGTH) {
  let token = ''
  while (token.length < length) {
    token += randomBase36Chunk()
  }
  return token.slice(0, length)
}

export function createGeneratedEntityId(prefix: string, tokenLength = DEFAULT_TOKEN_LENGTH) {
  return `${prefix}_${createOpaqueToken(tokenLength)}`
}

export function createEntryId() {
  return createGeneratedEntityId('e')
}

export function createBatchId(status: 'pending' | 'submitted') {
  return createGeneratedEntityId(status === 'pending' ? 'p' : 's')
}

export function createOrderId() {
  return createGeneratedEntityId('o')
}

export function createAttendanceRecordId() {
  return createGeneratedEntityId('r')
}

export function createMainLineId() {
  return MAIN_LINE_ID
}

export function createChildLineId(index: number) {
  const normalizedIndex = Math.max(0, index)
  return `${CHILD_LINE_PREFIX}${normalizedIndex.toString(BASE36_RADIX).padStart(BASE36_INDEX_WIDTH, '0')}`
}
