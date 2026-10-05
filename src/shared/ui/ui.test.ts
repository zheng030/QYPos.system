// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'

import type { PosOrderLine, PosReceiptData } from '@/features/pos-kernel/types'
import { bindBodyClass } from './body-class'
import { downloadBlob } from './download'
import { createImagePreview } from './image-preview'
import ReceiptView from './ReceiptView.vue'
import { createReceiptPrinter } from './receipt-printer'
import { createToastService } from './toast'

const MAIN_LINE: PosOrderLine = {
  lineId: 'entry_food_main',
  groupId: 'entry_food',
  role: 'main',
  catalogKey: 'pasta_risotto.chicken-breast',
  inventoryKey: 'pasta_risotto.chicken-breast',
  displayName: '青醬雞胸義大利麵',
  shortName: '青醬雞胸',
  categoryKey: 'pasta_risotto',
  station: 'kitchen',
  courseKind: 'food',
  quantity: 1,
  unitPrice: 250,
  priceDelta: 0,
  lineTotal: 250,
  selectionSummary: '主食：義大利麵 / 口味：青醬',
  isTreat: false,
  sourceEntryId: 'entry_food',
}

const RECEIPT: PosReceiptData = {
  seq: '12-1',
  table: 'A1',
  time: '2026/05/30 18:00:00',
  lines: [
    MAIN_LINE,
    {
      ...MAIN_LINE,
      lineId: 'entry_food_child_0',
      parentLineId: 'entry_food_main',
      role: 'upgrade',
      catalogKey: 'drink.latte',
      inventoryKey: 'drink.latte',
      displayName: '拿鐵咖啡',
      shortName: '拿鐵',
      categoryKey: 'drink',
      courseKind: 'drink',
      unitPrice: 60,
      priceDelta: 60,
      lineTotal: 60,
      selectionSummary: '溫度：冰',
    },
  ],
  original: 330,
  total: 310,
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.className = ''
  document.body.innerHTML = ''
})

describe('toast', () => {
  it('stacks repeats of one message as a count, strips markup, and expires', () => {
    vi.useFakeTimers()
    const toast = createToastService()

    toast.show('<b>已送出</b>')
    toast.show('另一則')
    toast.show('<b>已送出</b>')
    vi.advanceTimersToNextFrame()

    expect(toast.items.map(({ text, count, shown }) => ({ text, count, shown }))).toEqual([
      { text: '另一則', count: 1, shown: true },
      { text: '已送出', count: 2, shown: true },
    ])

    toast.show('另一則', { count: 5 })
    expect(toast.items.at(-1)).toMatchObject({ text: '另一則', count: 5 })

    vi.advanceTimersByTime(2500)
    expect(toast.items.every((item) => !item.shown)).toBe(true)
    vi.advanceTimersByTime(300)
    expect(toast.items).toHaveLength(0)
  })
})

describe('image preview', () => {
  it('opens one image at a time and closes on Escape', () => {
    const preview = createImagePreview()

    preview.open('/a.jpg', 'A')
    preview.open('/b.jpg', 'B')
    expect(preview.current.value).toEqual({ url: '/b.jpg', alt: 'B' })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(preview.current.value).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(preview.current.value).toBeNull()
  })
})

describe('downloadBlob', () => {
  it('clicks a temporary link and revokes the object url', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:file')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const clicks: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(`${this.download}:${this.getAttribute('href')}`)
    })

    downloadBlob(new Blob(['x']), 'a.csv', 0)
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)

    downloadBlob(new Blob(['y']), 'b.json')
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)

    expect(clicks).toEqual(['a.csv:blob:file', 'b.json:blob:file'])
    expect(document.querySelector('a')).toBeNull()
    click.mockRestore()
  })
})

describe('body class', () => {
  it('toggles the class synchronously with its source', () => {
    const active = shallowRef(false)
    const scope = effectScope()
    scope.run(() => bindBodyClass('staff-mode', () => active.value))

    expect(document.body.classList.contains('staff-mode')).toBe(false)
    active.value = true
    expect(document.body.classList.contains('staff-mode')).toBe(true)
    scope.stop()
  })
})

describe('receipt printer', () => {
  it('holds the receipt until the print dialog closes', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    const printer = createReceiptPrinter()

    const done = printer.print(RECEIPT, true)
    await nextTick()
    expect(print).toHaveBeenCalledTimes(1)
    expect(printer.job.value).toEqual({ data: RECEIPT, title: 'Kitchen 工作單' })

    window.dispatchEvent(new Event('afterprint'))
    await done
    expect(printer.job.value).toBeNull()
  })

  it('clears the receipt after the fallback delay or a print failure', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('print', vi.fn())
    const printer = createReceiptPrinter()

    const done = printer.print(RECEIPT)
    await nextTick()
    expect(printer.job.value?.title).toBe('結帳明細')
    vi.advanceTimersByTime(2000)
    await done
    expect(printer.job.value).toBeNull()

    vi.stubGlobal(
      'print',
      vi.fn(() => {
        throw new Error('blocked')
      })
    )
    await expect(printer.print(RECEIPT)).rejects.toThrow('blocked')
    expect(printer.job.value).toBeNull()
  })

  it('renders grouped receipt lines with child indentation', () => {
    const wrapper = mount(ReceiptView, { props: { data: RECEIPT, title: 'Kitchen 工作單' } })

    expect(wrapper.get('.receipt-header strong').text()).toBe('Kitchen 工作單')
    expect(wrapper.get('.receipt-info').text()).toContain('單號：12-1')
    expect(wrapper.get('.receipt-item').text()).toBe('青醬雞胸 x1 (主食：義大利麵 / 口味：青醬)$250')
    expect(wrapper.get('.entry-child-line').text()).toBe('拿鐵 x1 · 溫度：冰 $60')
    expect(wrapper.findAll('.receipt-footer .row').map((row) => row.text())).toEqual(['原價$330', '總計$310'])
  })
})
