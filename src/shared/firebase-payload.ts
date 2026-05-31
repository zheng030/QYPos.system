function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function sanitizeFirebaseValue<T>(value: T): T {
  if (value === undefined) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      const sanitized = sanitizeFirebaseValue(entry)
      return sanitized === undefined ? null : sanitized
    }) as T
  }

  if (!isPlainObject(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const sanitized = sanitizeFirebaseValue(entry)
      return sanitized === undefined ? [] : [[key, sanitized] as const]
    })
  ) as T
}

export function sanitizeFirebaseUpdatePayload(payload: Record<string, unknown>) {
  return sanitizeFirebaseValue(payload)
}

export function assertNoUndefinedFirebaseValue(value: unknown, path = '<root>') {
  if (value === undefined) {
    throw new Error(`Undefined Firebase value at ${path}`)
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoUndefinedFirebaseValue(entry, `${path}[${index}]`)
    })
    return
  }

  if (!isPlainObject(value)) {
    return
  }

  Object.entries(value).forEach(([key, entry]) => {
    assertNoUndefinedFirebaseValue(entry, path === '<root>' ? key : `${path}.${key}`)
  })
}
