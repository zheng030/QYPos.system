import CryptoJS from 'crypto-js'

const PBKDF2_ITERATIONS = 100000
const PBKDF2_KEY_SIZE_BITS = 256

export function base64ToBytes(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = ''

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }

  return btoa(binary)
}

function getSubtleCrypto() {
  const cryptoApi = globalThis.crypto
  return cryptoApi?.subtle
}

async function pbkdf2WithWebCrypto(password: string, saltBase64: string) {
  const subtle = getSubtleCrypto()
  if (!subtle) {
    throw new Error('Web Crypto unavailable')
  }

  const keyMaterial = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])

  const derivedBits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltBase64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    PBKDF2_KEY_SIZE_BITS
  )

  return bytesToBase64(new Uint8Array(derivedBits))
}

function pbkdf2WithCryptoJs(password: string, saltBase64: string) {
  const wordArray = CryptoJS.PBKDF2(password, CryptoJS.enc.Base64.parse(saltBase64), {
    keySize: PBKDF2_KEY_SIZE_BITS / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  })

  return CryptoJS.enc.Base64.stringify(wordArray)
}

export async function pbkdf2Hash(password: string, saltBase64: string) {
  try {
    return await pbkdf2WithWebCrypto(password, saltBase64)
  } catch {
    return pbkdf2WithCryptoJs(password, saltBase64)
  }
}

export function randomSaltBase64(size = 16) {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    const saltBytes = new Uint8Array(size)
    cryptoApi.getRandomValues(saltBytes)
    return bytesToBase64(saltBytes)
  }

  return CryptoJS.lib.WordArray.random(size).toString(CryptoJS.enc.Base64)
}
