import type { PosCustomerNotice } from '@/features/pos-kernel/types'
import type { RtdbV3RepositoryContext } from './rtdb-v3-repository-context'
import { getStaticDescriptorOrThrow, RTDB_V3_RESOURCE_KEYS } from './rtdb-v3-resource-registry'
import { RTDB_V3_ROOT } from './rtdb-v3-types'

function toCustomerNotice(value: unknown): PosCustomerNotice | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const stored = value as Partial<Record<keyof PosCustomerNotice, unknown>>
  return {
    enabled: stored.enabled === true,
    title: typeof stored.title === 'string' ? stored.title : '',
    message: typeof stored.message === 'string' ? stored.message : '',
  }
}

export function createRtdbV3RepositorySettingsModule(ctx: RtdbV3RepositoryContext) {
  const customerNoticeDescriptor = getStaticDescriptorOrThrow<PosCustomerNotice | null>(
    RTDB_V3_RESOURCE_KEYS.settingsCustomerNotice
  )
  // undefined: not loaded on this device yet; null: the shop never saved a notice.
  let customerNotice: PosCustomerNotice | null | undefined

  async function readCustomerNotice() {
    return await ctx.ensureManagedResource({
      descriptor: customerNoticeDescriptor,
      readMemory: () => customerNotice,
      writeMemory: (value) => {
        customerNotice = value
      },
      clearMemory: () => {
        customerNotice = undefined
      },
      readRemote: async () => {
        const snapshot = await ctx.db.ref(`${RTDB_V3_ROOT}/${customerNoticeDescriptor.remotePath}`).once('value')
        return toCustomerNotice(snapshot.val())
      },
    })
  }

  async function saveCustomerNotice(notice: PosCustomerNotice) {
    const payload: Record<string, unknown> = {
      [`${RTDB_V3_ROOT}/${customerNoticeDescriptor.remotePath}`]: notice,
    }
    ctx.touchRevision(customerNoticeDescriptor.revision.path, payload)
    await ctx.updateRoot(payload)
    customerNotice = notice
    await ctx.writeManagedResourceCache(customerNoticeDescriptor, notice)
  }

  return { readCustomerNotice, saveCustomerNotice }
}
