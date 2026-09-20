import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor shell config (MOBILE-PLAN.md P3).
 *
 * `androidScheme: 'http'` makes the WebView serve the bundle from the origin
 * `http://localhost`. That is deliberate and load-bearing: the Hermes dashboard
 * hardcodes its CORS allowlist to
 *
 *     ^https?://(localhost|127\.0\.0\.1)(:\d+)?$        (web_server.py:286)
 *
 * so the native origin lands INSIDE the server's existing same-origin lock
 * rather than having to be worked around with a reverse proxy. This is the
 * single reason Capacitor was chosen over a Trusted Web Activity, which would
 * present a real remote https origin and be rejected.
 *
 * No `server.url` is set: the app talks to whichever gateway is selected at
 * runtime through the saved-gateways mechanism, so the bundle stays local.
 */
const config: CapacitorConfig = {
  appId: 'com.epeder.hermesui',
  appName: 'Hermes',
  webDir: 'dist',
  android: {
    // Release builds must not ship a debuggable WebView; CI builds debug APKs
    // for sideloading today (see .github/workflows/android.yml).
    allowMixedContent: false
  },
  server: {
    // MUST be 'http', not 'https'. The gateway is served over PLAINTEXT http
    // (safe, because the only path to it is the Tailscale WireGuard tunnel -
    // see MOBILE-PLAN.md 3.2). An 'https://localhost' page is a secure context,
    // so the WebView would block every call to http://<tailnet-ip>:9119 as
    // mixed content, and would refuse a ws:// socket from a secure origin.
    // 'http://localhost' still matches the server's CORS allowlist, and
    // Chromium treats http://localhost as a potentially-trustworthy origin, so
    // secure-context APIs (crypto.subtle, MediaRecorder) keep working.
    androidScheme: 'http'
  }
}

export default config
