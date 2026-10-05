import type { PosCustomerNotice } from './types'

export const EMPTY_CUSTOMER_NOTICE: PosCustomerNotice = { enabled: false, title: '', message: '' }

export function hasCustomerNoticeContent(notice: Pick<PosCustomerNotice, 'title' | 'message'>) {
  return Boolean(notice.title.trim() || notice.message.trim())
}

export function shouldShowCustomerNotice(notice: PosCustomerNotice | null): notice is PosCustomerNotice {
  return notice?.enabled === true && hasCustomerNoticeContent(notice)
}
