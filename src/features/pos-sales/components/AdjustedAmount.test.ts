// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { buildAdjustedAmountDisplay } from '../runtime-support'
import AdjustedAmount from './AdjustedAmount.vue'

describe('AdjustedAmount', () => {
  it('shows a plain label without an adjustment and a struck original with one', () => {
    expect(mount(AdjustedAmount, { props: { display: buildAdjustedAmountDisplay(310, 310) } }).html()).toBe('$310')

    const adjusted = mount(AdjustedAmount, {
      props: {
        display: {
          originalLabel: '$310',
          finalLabel: '$0',
          hasAdjustment: true,
          finalTone: 'success',
          noteLabel: '招待',
        },
        stacked: true,
      },
    })
    expect(adjusted.get('.price-adjusted').classes()).toContain('price-adjusted--stack')
    expect(adjusted.get('.price-adjusted-original').text()).toBe('$310')
    expect(adjusted.get('.price-adjusted-final').classes()).toContain('price-adjusted-final--success')
    expect(adjusted.get('.price-adjusted-note').text()).toBe('招待')
  })
})
