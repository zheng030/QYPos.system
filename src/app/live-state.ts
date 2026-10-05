import { shallowRef } from 'vue'

import type { PosDataService } from '@/features/pos-data/service'
import type { CorePosState } from '@/features/pos-kernel/types'

export type LiveState = {
  state(): CorePosState
  touch(): void
}

// The data layer mutates the kernel state in place; this revision counter is the single reactive
// signal that tells Vue to re-read it after every data change.
export function createLiveState(state: CorePosState, data: Pick<PosDataService, 'subscribe'>): LiveState {
  const revision = shallowRef(0)

  function touch() {
    revision.value += 1
  }

  data.subscribe(touch)

  return {
    state() {
      void revision.value
      return state
    },
    touch,
  }
}
