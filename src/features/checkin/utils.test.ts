import { afterEach, describe, expect, it } from 'vitest'

import { runtime } from './store'
import { ensureContainer } from './utils'

type ElementStub = {
  id: string
  className: string
  style: { display: string }
  textContent: string
  dataset: Record<string, string>
  children: ElementStub[]
  parent: ElementStub | null
  classList: {
    add: (...tokens: string[]) => void
    contains: (token: string) => boolean
  }
  appendChild: (child: ElementStub) => ElementStub
  prepend: (child: ElementStub) => ElementStub
  setAttribute: (name: string, value: string) => void
  querySelector: (selector: string) => ElementStub | null
}

function createElementStub(tagName = 'div'): ElementStub {
  const element: ElementStub = {
    id: '',
    className: '',
    style: { display: '' },
    textContent: '',
    dataset: {},
    children: [],
    parent: null,
    classList: {
      add: (...tokens: string[]) => {
        const classNames = new Set(element.className.split(/\s+/).filter(Boolean))
        for (const token of tokens) {
          classNames.add(token)
        }
        element.className = Array.from(classNames).join(' ')
      },
      contains: (token: string) => element.className.split(/\s+/).includes(token),
    },
    appendChild: (child: ElementStub) => {
      child.parent = element
      element.children.push(child)
      return child
    },
    prepend: (child: ElementStub) => {
      child.parent = element
      element.children.unshift(child)
      return child
    },
    setAttribute: (name: string, value: string) => {
      if (name === 'data-action') {
        element.dataset.action = value
      }
    },
    querySelector: (selector: string) => querySelector(element, selector),
  }
  Object.defineProperty(element, 'innerHTML', {
    get: () => '',
    set: () => {},
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(element, 'firstChild', {
    get: () => element.children[0] || null,
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(element, 'tagName', {
    value: tagName.toUpperCase(),
    enumerable: true,
  })
  return element
}

function matchSelector(element: ElementStub, selector: string) {
  if (selector.startsWith('#')) {
    return element.id === selector.slice(1)
  }
  if (selector.startsWith('.')) {
    return element.classList.contains(selector.slice(1))
  }
  if (selector === '[data-action="checkin-back"]') {
    return element.dataset.action === 'checkin-back'
  }
  return false
}

function querySelector(root: ElementStub, selector: string): ElementStub | null {
  for (const child of root.children) {
    if (matchSelector(child, selector)) {
      return child
    }
    const nested = querySelector(child, selector)
    if (nested) {
      return nested
    }
  }
  return null
}

function installDocumentStub() {
  const appContainer = createElementStub('div')
  appContainer.id = 'app-container'
  const elements = new Map<string, ElementStub>([['app-container', appContainer]])
  const documentStub = {
    createElement: (tagName: string) => createElementStub(tagName),
    getElementById: (id: string) => {
      if (elements.has(id)) {
        return elements.get(id) || null
      }
      for (const element of elements.values()) {
        const match = querySelector(element, `#${id}`)
        if (match) {
          elements.set(id, match)
          return match
        }
      }
      return null
    },
  }

  ;(globalThis as { document?: unknown }).document = documentStub as unknown
  ;(globalThis as { HTMLElement?: unknown }).HTMLElement = Object as unknown

  return {
    appContainer,
    reset() {
      appContainer.children.length = 0
      runtime.pageEl = null
      runtime.rootEl = null
    },
  }
}

const dom = installDocumentStub()

afterEach(() => {
  dom.reset()
})

describe('checkin ensureContainer', () => {
  it('creates the full checkin shell when the page is missing', () => {
    const page = ensureContainer()

    expect(page).not.toBeNull()
    expect(page?.classList.contains('checkin-page')).toBe(true)
    expect(page?.querySelector('.checkin-shell')).not.toBeNull()
    expect(page?.querySelector('[data-action="checkin-back"]')?.textContent).toBe('⬅ 返回主畫面')
    expect(page?.querySelector('#checkin-root')).not.toBeNull()
    expect(runtime.pageEl).toBe(page)
    expect(runtime.rootEl).toBe(page?.querySelector('#checkin-root'))
  })

  it('repairs a malformed existing checkin page in place', () => {
    const malformedPage = createElementStub('div')
    malformedPage.id = 'checkinPage'
    dom.appContainer.appendChild(malformedPage)

    const page = ensureContainer()

    expect(page).toBe(malformedPage)
    expect(page?.classList.contains('checkin-page')).toBe(true)
    expect(page?.querySelector('.checkin-shell')).not.toBeNull()
    expect(page?.querySelector('[data-action="checkin-back"]')).not.toBeNull()
    expect(page?.querySelector('#checkin-root')).not.toBeNull()
    expect(runtime.rootEl).toBe(page?.querySelector('#checkin-root'))
  })
})
