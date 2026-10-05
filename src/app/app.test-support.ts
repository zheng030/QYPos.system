import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach } from 'vitest'

import { IMAGE_PREVIEW_KEY } from '@/shared/ui/image-preview'
import App from './App.vue'
import { createPosRuntime, POS_RUNTIME_KEY, type PosRuntime } from './runtime'

enableAutoUnmount(afterEach)

// Callers mock `@/shared/firebase-compat` with `./firebase-compat.test-support` before mounting.
// `beforeStart` seeds the fresh database before the app reads it, like data saved by another device.
export async function mountApp({ beforeStart }: { beforeStart?: (runtime: PosRuntime) => Promise<unknown> } = {}) {
  const runtime = createPosRuntime()
  const wrapper = mount(App, {
    attachTo: document.body,
    global: { provide: { [POS_RUNTIME_KEY]: runtime, [IMAGE_PREVIEW_KEY]: runtime.imagePreview } },
  })
  await beforeStart?.(runtime)
  await runtime.start()
  await flushPromises()
  return { runtime, wrapper }
}

export async function login(wrapper: Awaited<ReturnType<typeof mountApp>>['wrapper']) {
  await wrapper.get('#loginPass').setValue('1234')
  await wrapper.get('#login-screen button').trigger('click')
  await flushPromises()
}

export async function mountLoggedInApp() {
  const app = await mountApp()
  await login(app.wrapper)
  return app
}

export function display(selector: string) {
  return document.querySelector<HTMLElement>(selector)?.style.display
}

export function findByText<T extends HTMLElement = HTMLElement>(selector: string, text: string) {
  const element = [...document.querySelectorAll<T>(selector)].find((candidate) => candidate.textContent?.includes(text))
  if (!element) throw new Error(`Missing ${selector} with ${text}`)
  return element
}

export async function clickText(selector: string, text: string) {
  findByText(selector, text).click()
  await flushPromises()
}
