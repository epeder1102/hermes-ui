// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveShellMode, storeShellMode } from './shell-mode'

/**
 * These guard the regression that made the first P4 build invisible: the mobile
 * shell was gated on `?m=1`, but the installed APK loads a fixed URL with no
 * address bar, so the flag could never be set and the phone kept getting the
 * desktop shell.
 */
function setSearch(search: string) {
  window.history.replaceState({}, '', `/${search}`)
}

function setWidth(width: number) {
  window.matchMedia = ((query: string) => ({
    matches: /max-width:\s*(\d+)px/.test(query) ? width <= Number(RegExp.$1) : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  window.localStorage.clear()
  setSearch('')
})

afterEach(() => {
  window.localStorage.clear()
})

describe('resolveShellMode', () => {
  it('picks the mobile shell on a phone-width viewport with no flag and no preference', () => {
    // This is the APK's exact situation: fixed URL, no query string.
    setWidth(412)

    expect(resolveShellMode()).toBe('mobile')
  })

  it('leaves a desktop-width viewport on the desktop shell', () => {
    setWidth(1440)

    expect(resolveShellMode()).toBe('desktop')
  })

  it('honours an explicit ?m=1 on a wide viewport', () => {
    setWidth(1440)
    setSearch('?m=1')

    expect(resolveShellMode()).toBe('mobile')
  })

  it('honours an explicit ?m=0 on a phone viewport', () => {
    setWidth(412)
    setSearch('?m=0')

    expect(resolveShellMode()).toBe('desktop')
  })

  it('persists an explicit flag so the choice survives the next flagless load', () => {
    setWidth(412)
    setSearch('?m=0')
    expect(resolveShellMode()).toBe('desktop')

    // The APK reloads without a query string; the stored choice must win over
    // the viewport, otherwise the toggle would appear to do nothing.
    setSearch('')
    expect(resolveShellMode()).toBe('desktop')
  })

  it('lets a stored preference override the viewport in both directions', () => {
    setWidth(1440)
    storeShellMode('mobile')
    expect(resolveShellMode()).toBe('mobile')

    storeShellMode('desktop')
    setWidth(412)
    expect(resolveShellMode()).toBe('desktop')
  })

  it('falls back to the desktop shell when matchMedia is unavailable', () => {
    // Older WebViews and some test environments have no matchMedia. Failing
    // closed to the desktop shell is wrong for a phone, but it must not throw
    // during boot — the in-app toggle and ?m=1 both remain available.
    // @ts-expect-error deliberately removing the API
    window.matchMedia = undefined

    expect(() => resolveShellMode()).not.toThrow()
    expect(resolveShellMode()).toBe('desktop')
  })
})
