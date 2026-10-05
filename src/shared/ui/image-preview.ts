import { type InjectionKey, inject, shallowRef } from 'vue'

export type ImagePreviewState = {
  url: string
  alt: string
}

export function createImagePreview() {
  const current = shallowRef<ImagePreviewState | null>(null)

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close()
    }
  }

  function close() {
    current.value = null
    document.removeEventListener('keydown', onKeydown)
  }

  function open(url: string, alt: string) {
    close()
    current.value = { url, alt }
    document.addEventListener('keydown', onKeydown)
  }

  return { current, open, close }
}

export type ImagePreview = ReturnType<typeof createImagePreview>

export const IMAGE_PREVIEW_KEY: InjectionKey<ImagePreview> = Symbol('image-preview')

export function useImagePreview() {
  const preview = inject(IMAGE_PREVIEW_KEY)
  if (!preview) {
    throw new Error('Image preview is not provided')
  }
  return preview
}
