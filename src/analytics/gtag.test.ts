import { describe, it, expect } from 'vitest'
import { wantsGaDebug } from './gtag'

describe('wantsGaDebug', () => {
  it('enables debug for ga_debug=1 and ga_debug=true', () => {
    expect(wantsGaDebug('?ga_debug=1')).toBe(true)
    expect(wantsGaDebug('?ga_debug=true')).toBe(true)
  })

  it('is off when the param is absent', () => {
    expect(wantsGaDebug('')).toBe(false)
    expect(wantsGaDebug('?foo=bar')).toBe(false)
  })

  it('is off for other/false-ish values, not just any presence', () => {
    expect(wantsGaDebug('?ga_debug=0')).toBe(false)
    expect(wantsGaDebug('?ga_debug=false')).toBe(false)
    expect(wantsGaDebug('?ga_debug=')).toBe(false)
  })

  it('finds the param alongside others', () => {
    expect(wantsGaDebug('?foo=bar&ga_debug=1')).toBe(true)
  })
})
