import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor shell config (MOBILE-PLAN.md P3).
 *
 * `androidScheme: 'https'` makes the WebView serve the bundle from the origin
 * `https://localhost`. That is deliberate and load-bearing: the Hermes dashboard
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
    androidScheme: 'https'
  }
}

export default config
