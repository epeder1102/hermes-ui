export type ShellMode = 'desktop' | 'mobile'

const STORAGE_KEY = 'hermes.shell.mode'
/** Below this width the desktop three-pane shell has no room to be itself. */
const MOBILE_MAX_WIDTH = 820

/**
 * Which shell to mount.
 *
 * This deliberately does NOT depend on a query parameter alone. The Android APK
 * is a thin Capacitor shell that loads `server.url` verbatim
 * (`app/capacitor.config.ts`) — there is no address bar, so `?m=1` is
 * unreachable from the installed app. Gating the mobile shell on a query param
 * made it invisible to the one client it was built for.
 *
 * Order of precedence:
 *   1. An explicit `?m=1` / `?m=0`, which also persists — this is how a desktop
 *      browser opts in or out, and how the APK could be pinned if ever needed.
 *   2. A stored preference, set by the in-app toggle.
 *   3. Viewport width. Width alone, not `pointer: coarse`: a narrow desktop
 *      window is better served by the mobile shell too, and requiring both
 *      signals risks a device that reports neither leaving the user with no way
 *      back in.
 */
export function resolveShellMode(): ShellMode {
  const explicit = readExplicitMode()

  if (explicit) {
    storeShellMode(explicit)

    return explicit
  }

  const stored = readStoredMode()

  if (stored) {
    return stored
  }

  return isNarrowViewport() ? 'mobile' : 'desktop'
}

function readExplicitMode(): ShellMode | null {
  try {
    const flag = new URLSearchParams(window.location.search).get('m')

    if (flag === '1') {
      return 'mobile'
    }

    if (flag === '0') {
      return 'desktop'
    }
  } catch {
    // A malformed query string is not a reason to fail boot.
  }

  return null
}

function readStoredMode(): ShellMode | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    return stored === 'mobile' || stored === 'desktop' ? stored : null
  } catch {
    return null
  }
}

function isNarrowViewport(): boolean {
  try {
    return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches
  } catch {
    return false
  }
}

export function storeShellMode(mode: ShellMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Preference is a convenience; a blocked store just falls back to viewport.
  }
}

/**
 * Switch shells. A reload is intentional rather than a live swap: the two shells
 * mount different hook graphs against the same singleton stores, and tearing one
 * down while the other boots would double-boot the gateway socket.
 */
export function switchShellMode(mode: ShellMode): void {
  storeShellMode(mode)

  try {
    const url = new URL(window.location.href)

    // Drop a stale ?m= so the reload resolves through the stored preference and
    // the URL cannot contradict the button that was just pressed.
    url.searchParams.delete('m')
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}
