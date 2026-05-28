type DomActionEventType =
  | 'click'
  | 'change'
  | 'input'
  | 'submit'
  | 'keydown'
  | 'compositionstart'
  | 'compositionend'
  | 'mouseover'
  | 'mousemove'
  | 'mouseout'

type DomActionHandler = (event: Event, element: HTMLElement) => void

type DomActionRouter = {
  on(type: DomActionEventType, action: string, handler: DomActionHandler): void
  start(): () => void
}

export function createDomActionRouter(root: ParentNode): DomActionRouter {
  const handlers = new Map<DomActionEventType, Map<string, DomActionHandler>>()

  function getActionElement(event: Event) {
    const target = event.target
    if (!(target instanceof Element)) {
      return null
    }
    return target.closest<HTMLElement>('[data-action]')
  }

  function dispatch(type: DomActionEventType, event: Event) {
    const element = getActionElement(event)
    if (!element) {
      return
    }

    const action = element.dataset.action
    if (!action) {
      return
    }

    const handler = handlers.get(type)?.get(action)
    if (!handler) {
      return
    }

    handler(event, element)
  }

  return {
    on(type, action, handler) {
      if (!handlers.has(type)) {
        handlers.set(type, new Map())
      }
      handlers.get(type)?.set(action, handler)
    },
    start() {
      const eventTypes: DomActionEventType[] = [
        'click',
        'change',
        'input',
        'submit',
        'keydown',
        'compositionstart',
        'compositionend',
        'mouseover',
        'mousemove',
        'mouseout',
      ]

      eventTypes.forEach((type) => {
        root.addEventListener(type, (event) => {
          dispatch(type, event)
        })
      })

      return () => {
        // Root listeners are process-lifetime for the app.
      }
    },
  }
}
