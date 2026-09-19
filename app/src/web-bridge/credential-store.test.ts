import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { SecureStorageAdapter } from './credential-store'
import {
  hydrateCredentials,
  isHydrated,
  LocalStorageCredentialStore,
  lockCredentials,
  MemoryCredentialStore,
  peekCredential,
  removeCredential,
  resetCredentialStoreForTests,
  SecureCredentialStore,
  SESSION_TOKEN_KEY,
  setCredential,
  setCredentialStore
} from './credential-store'

/** Async adapter standing in for the Capacitor Keystore plugin. */
function fakeSecureAdapter(seed: Record<string, string> = {}): SecureStorageAdapter & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(seed))

  return {
    store,
    get: (key) => Promise.resolve(store.get(key) ?? null),
    remove: (key) => {
      store.delete(key)

      return Promise.resolve()
    },
    set: (key, value) => {
      store.set(key, value)

      return Promise.resolve()
    }
  }
}

describe('credential-store', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetCredentialStoreForTests()
  })

  afterEach(() => {
    resetCredentialStoreForTests()
  })

  it('reads localStorage synchronously without hydration', async () => {
    window.localStorage.setItem(SESSION_TOKEN_KEY, 'tok-from-storage')
    setCredentialStore(new LocalStorageCredentialStore())

    // No hydrate call: the web path must not depend on boot order.
    expect(peekCredential(SESSION_TOKEN_KEY)).toBe('tok-from-storage')

    await setCredential(SESSION_TOKEN_KEY, 'tok-updated')
    expect(window.localStorage.getItem(SESSION_TOKEN_KEY)).toBe('tok-updated')
    expect(peekCredential(SESSION_TOKEN_KEY)).toBe('tok-updated')
  })

  it('round-trips through the in-memory store', async () => {
    setCredentialStore(new MemoryCredentialStore())

    await setCredential(SESSION_TOKEN_KEY, 'mem-tok')
    expect(peekCredential(SESSION_TOKEN_KEY)).toBe('mem-tok')

    await removeCredential(SESSION_TOKEN_KEY)
    expect(peekCredential(SESSION_TOKEN_KEY)).toBeNull()
  })

  it('returns null from a secure store until hydrated', async () => {
    setCredentialStore(new SecureCredentialStore(fakeSecureAdapter({ [SESSION_TOKEN_KEY]: 'keystore-tok' })))

    expect(isHydrated()).toBe(false)
    expect(peekCredential(SESSION_TOKEN_KEY)).toBeNull()

    await hydrateCredentials()

    expect(isHydrated()).toBe(true)
    expect(peekCredential(SESSION_TOKEN_KEY)).toBe('keystore-tok')
  })

  it('locking clears the cache but preserves persistence', async () => {
    const adapter = fakeSecureAdapter()

    setCredentialStore(new SecureCredentialStore(adapter))
    await setCredential(SESSION_TOKEN_KEY, 'admin-tok')
    expect(peekCredential(SESSION_TOKEN_KEY)).toBe('admin-tok')

    lockCredentials()

    // This is the admin-lock contract: unreadable in memory, still stored.
    expect(peekCredential(SESSION_TOKEN_KEY)).toBeNull()
    expect(isHydrated()).toBe(false)
    expect(adapter.store.get(SESSION_TOKEN_KEY)).toBe('admin-tok')

    await hydrateCredentials()
    expect(peekCredential(SESSION_TOKEN_KEY)).toBe('admin-tok')
  })

  it('hydrating drops keys that are no longer persisted', async () => {
    const adapter = fakeSecureAdapter({ [SESSION_TOKEN_KEY]: 'stale' })

    setCredentialStore(new SecureCredentialStore(adapter))
    await hydrateCredentials()
    expect(peekCredential(SESSION_TOKEN_KEY)).toBe('stale')

    adapter.store.delete(SESSION_TOKEN_KEY)
    await hydrateCredentials()
    expect(peekCredential(SESSION_TOKEN_KEY)).toBeNull()
  })

  it('refuses localStorage credentials on the native runtime', () => {
    const win = window as unknown as { Capacitor?: { isNativePlatform: () => boolean } }

    win.Capacitor = { isNativePlatform: () => true }

    try {
      expect(() => setCredentialStore(new LocalStorageCredentialStore())).toThrow(/refusing to use localStorage/)
      expect(() => setCredentialStore(new SecureCredentialStore(fakeSecureAdapter()))).not.toThrow()
    } finally {
      delete win.Capacitor
    }
  })
})
