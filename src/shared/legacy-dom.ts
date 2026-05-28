type LegacyClickHandler = ((this: GlobalEventHandlers, event: MouseEvent) => unknown) | null

export type LegacyDomElement = HTMLElement & {
  value: unknown
  checked: boolean
  innerText: string
  onclick: LegacyClickHandler
}

declare global {
  interface Element {
    value: unknown
    checked: boolean
    innerText: string
    onclick: LegacyClickHandler
    style: CSSStyleDeclaration
  }

  interface EventTarget {
    tagName?: string
    isContentEditable?: boolean
  }
}

export function getLegacyElement(id: string) {
  return document.getElementById(id) as LegacyDomElement
}
