/**
 * Credential storage seam (MOBILE-PLAN.md P1).
 *
 * Why this exists
 * ---------------
 * `bridge.ts` resolves the gateway session token SYNCHRONOUSLY (`resolveToken`),
 * because every REST call and every WebSocket URL build needs it inline. That is
 * fine in a browser, where `localStorage` is synchronous.
 *
 * It is NOT fine on Android. The security bar for this app requires the token to
 * live in Keystore-backed storage (EncryptedSharedPreferences), and every
 * Capacitor secure-storage API is asynchronous. A synchronous resolver can never
 * read from it directly.
 *
 * The resolution is hydrate-at-boot:
 *
 *   1. A `CredentialStore` owns persistence and may be async.
 *   2. `hydrateCredentials()` runs once before the app mounts and pulls the
 *      persisted values into an in-memory cache.
 *   3. `peekCredential()` stays synchronous and reads only that cache, so the
 *      entire existing call graph in `bridge.ts` is unchanged.
 *   4. `lockCredentials()` zeroes the cache without touching persistence, which
 *      is how the admin-profile lock in P5 works: the token is still stored, but
 *      unreadable until a fresh biometric re-hydrates it.
 *
 * On the web the active store is `localStorage` and reads are genuinely
 * synchronous, so `peekCredential()` falls through to a direct read and boot
 * order cannot matter. Web behaviour is therefore identical to before this file
 * existed; the async path exists for the native shell.
 *
 * SECURITY: `LocalStorageCredentialStore` is NOT acceptable on the native build.
 * It is the dev/desktop-PWA backend only. `selectCredentialStore()` refuses to
 * pick it when it detects a Capacitor runtime.
 */

/** Storage keys are namespaced so a future migration can enumerate them. */
export const SESSION_TOKEN_KEY = 'hermes-web.session-token'

export interface CredentialStore {
  /** Backend identity, surfaced in diagnostics so we can prove what is in use. */
  readonly id: 'local-storage' | 'memory' | 'secure'
  /**
   * True when values are only readable via `get()`. Such a store MUST be
   * hydrated before `peekCredential()` returns anything meaningful.
   */
  readonly requiresHydration: boolean
  get(key: string): Promise<null | string>
  /** Synchronous best-effort read. Returns null on a hydration-required store. */
  peek(key: string): null | string
  remove(key: string): Promise<void>
  set(key: string, value: string): Promise<void>
}

/** In-memory only. Used by tests, and as the locked state for gated profiles. */
export class MemoryCredentialStore implements CredentialStore {
  readonly id = 'memory' as const
  readonly requiresHydration = false
  private readonly values = new Map<string, string>()

  get(key: string): Promise<null | string> {
    return Promise.resolve(this.peek(key))
  }

  peek(key: string): null | string {
    return this.values.get(key) ?? null
  }

  remove(key: string): Promise<void> {
    this.values.delete(key)

    return Promise.resolve()
  }

  set(key: string, value: string): Promise<void> {
    this.values.set(key, value)

    return Promise.resolve()
  }
}

/**
 * Browser `localStorage`. Synchronous, so no hydration is required and boot
 * order is irrelevant. Dev and desktop-PWA only — see the SECURITY note above.
 */
export class LocalStorageCredentialStore implements CredentialStore {
  readonly id = 'local-storage' as const
  readonly requiresHydration = false

  get(key: string): Promise<null | string> {
    return Promise.resolve(this.peek(key))
  }

  peek(key: string): null | string {
    try {
      return window.localStorage.getItem(key)
    } catch {
      // A blocked/full localStorage just means non-persisted state.
      return null
    }
  }

  remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // best-effort
    }

    return Promise.resolve()
  }

  set(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // best-effort
    }

    return Promise.resolve()
  }
}

/**
 * Keystore-backed storage for the Capacitor shell. The concrete plugin call is
 * injected rather than imported so this module stays dependency-free and
 * testable in jsdom; P5 supplies the real adapter.
 *
 * The adapter MUST be backed by EncryptedSharedPreferences with a Keystore
 * generated key. Several popular Capacitor "secure storage" plugins are thin
 * SharedPreferences wrappers with a hardcoded key — verify the source, not the
 * README (MOBILE-PLAN.md §5).
 */
export interface SecureStorageAdapter {
  get(key: string): Promise<null | string>
  remove(key: string): Promise<void>
  set(key: string, value: string): Promise<void>
}

export class SecureCredentialStore implements CredentialStore {
  readonly id = 'secure' as const
  readonly requiresHydration = true

  constructor(private readonly adapter: SecureStorageAdapter) {}

  get(key: string): Promise<null | string> {
    return this.adapter.get(key)
  }

  peek(): null | string {
    // Keystore reads are async by construction; callers must hydrate first.
    return null
  }

  remove(key: string): Promise<void> {
    return this.adapter.remove(key)
  }

  set(key: string, value: string): Promise<void> {
    return this.adapter.set(key, value)
  }
}

/** True when running inside the Capacitor native shell rather than a browser. */
export function isNativeRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor

  return typeof cap?.isNativePlatform === 'function' ? cap.isNativePlatform() : false
}

let activeStore: CredentialStore = new LocalStorageCredentialStore()
const cache = new Map<string, string>()
let hydrated = false

/**
 * Install the backend. Called once at boot, before `hydrateCredentials()`.
 * Refuses `localStorage` on native so a misconfigured build fails loudly rather
 * than silently writing the token to plaintext.
 */
export function setCredentialStore(store: CredentialStore): void {
  if (store.id === 'local-storage' && isNativeRuntime()) {
    throw new Error('refusing to use localStorage for credentials on the native runtime')
  }

  activeStore = store
  cache.clear()
  hydrated = !store.requiresHydration
}

export function getCredentialStore(): CredentialStore {
  return activeStore
}

/**
 * Pull persisted credentials into the synchronous cache. Safe to call more than
 * once; a second call refreshes the cache (which is what an admin unlock does).
 */
export async function hydrateCredentials(keys: readonly string[] = [SESSION_TOKEN_KEY]): Promise<void> {
  for (const key of keys) {
    const value = await activeStore.get(key)

    if (value === null) {
      cache.delete(key)
    } else {
      cache.set(key, value)
    }
  }

  hydrated = true
}

/**
 * Drop cached credentials without touching persistence. The values remain
 * stored but unreadable until the next `hydrateCredentials()`, which is the
 * mechanism behind the admin-profile lock (MOBILE-PLAN.md §3.5).
 */
export function lockCredentials(): void {
  cache.clear()

  if (activeStore.requiresHydration) {
    hydrated = false
  }
}

export function isHydrated(): boolean {
  return hydrated
}

/** Synchronous read for the existing `bridge.ts` call graph. */
export function peekCredential(key: string): null | string {
  const cached = cache.get(key)

  if (cached !== undefined) {
    return cached
  }

  // Synchronous backends can always answer directly, so web boot order is
  // irrelevant and behaviour matches the pre-seam direct localStorage read.
  if (!activeStore.requiresHydration) {
    return activeStore.peek(key)
  }

  return null
}

/** Write through to persistence and keep the synchronous cache coherent. */
export async function setCredential(key: string, value: string): Promise<void> {
  cache.set(key, value)
  await activeStore.set(key, value)
}

export async function removeCredential(key: string): Promise<void> {
  cache.delete(key)
  await activeStore.remove(key)
}

/** Test seam: restore module state between cases. */
export function resetCredentialStoreForTests(): void {
  activeStore = new LocalStorageCredentialStore()
  cache.clear()
  hydrated = true
}
