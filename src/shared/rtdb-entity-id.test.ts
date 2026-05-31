import { describe, expect, it } from 'vitest'

import {
  createAttendanceRecordId,
  createBatchId,
  createChildLineId,
  createEntryId,
  createMainLineId,
  createOrderId,
} from './rtdb-entity-id'

describe('rtdb entity id helper', () => {
  it('creates short opaque generated ids for each RTDB entity family', () => {
    expect(createEntryId()).toMatch(/^e_[a-z0-9]{8}$/)
    expect(createBatchId('pending')).toMatch(/^p_[a-z0-9]{8}$/)
    expect(createBatchId('submitted')).toMatch(/^s_[a-z0-9]{8}$/)
    expect(createOrderId()).toMatch(/^o_[a-z0-9]{8}$/)
    expect(createAttendanceRecordId()).toMatch(/^r_[a-z0-9]{8}$/)
  })

  it('creates compact entry-local line ids', () => {
    expect(createMainLineId()).toBe('m')
    expect(createChildLineId(0)).toBe('c00')
    expect(createChildLineId(1)).toBe('c01')
    expect(createChildLineId(35)).toBe('c0z')
    expect(createChildLineId(36)).toBe('c10')
  })
})
