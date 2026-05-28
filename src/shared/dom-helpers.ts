export function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing required element: #${id}`)
  }
  return element as T
}

export function findElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
  const element = document.getElementById(id)
  return element instanceof HTMLElement ? (element as T) : null
}

export function requireInput(id: string): HTMLInputElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing required input: #${id}`)
  }
  return element
}

export function requireCheckedInput(name: string): HTMLInputElement {
  const element = document.querySelector(`input[name="${name}"]:checked`)
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Missing required checked input: ${name}`)
  }
  return element
}

export function requireSelector<T extends Element = Element>(selector: string): T {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`Missing required selector: ${selector}`)
  }
  return element as T
}

export function findSelector<T extends Element = Element>(selector: string): T | null {
  const element = document.querySelector(selector)
  return element ? (element as T) : null
}
