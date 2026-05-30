const FORBIDDEN_RTDL_KEY_CHARS = /[.#$/[\]%]/g

function encodeForbiddenChar(char: string) {
  return `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
}

export function encodeRtdbKeySegment(value: string) {
  if (!value) {
    throw new Error('RTDB key segment cannot be empty')
  }
  return value.replace(FORBIDDEN_RTDL_KEY_CHARS, encodeForbiddenChar)
}

export function decodeRtdbKeySegment(value: string) {
  if (!value) return ''
  return value.replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
}
