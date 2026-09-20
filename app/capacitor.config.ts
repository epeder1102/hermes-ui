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
    // The gateway serves THIS bundle via HERMES_WEB_DIST, so the WebView loads
    // the UI from the gateway's own origin. Everything is then same-origin:
    // no CORS, no SameSite=Lax cookie problem, no mixed content, no WebSocket
    // origin question, and no need to defeat the web bridge's deliberate
    // "gateway must be same-origin" guard (gateways.ts:classifyGatewayReach).
    //
    // Loading the local bundle and calling the gateway cross-origin does NOT
    // work: the guard rejects it, and even bypassed, the dashboard's host-only
    // SameSite=Lax session cookie is not sent cross-origin.
    //
    // Consequence worth knowing: the APK is a thin shell. UI changes ship by
    // redeploying dist/ to CT 114 - no rebuild, no reinstall.
    //
    // Caveat: the tailnet address is baked in here. If CT 114's Tailscale IP
    // changes, this, the dashboard bind, and network_security_config.xml all
    // have to move together.
    androidScheme: 'http',
    url: 'http://100.104.221.85:9119',
    cleartext: true
  }
}

export default config
