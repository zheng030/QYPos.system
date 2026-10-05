import { createApp } from 'vue'

import App from '@/app/App.vue'
import { createPosRuntime, POS_RUNTIME_KEY } from '@/app/runtime'
import { IMAGE_PREVIEW_KEY } from '@/shared/ui/image-preview'

import '@/features/pos-shell/style.css'
import '@/features/pos-admin/style.css'
import '@/features/checkin/style.css'

const runtime = createPosRuntime()

document.body.setAttribute('ontouchstart', '')

createApp(App).provide(POS_RUNTIME_KEY, runtime).provide(IMAGE_PREVIEW_KEY, runtime.imagePreview).mount('#app-root')

void runtime.start()
