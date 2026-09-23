# Hermes Mobile App — Implementation Plan

**Status:** active
**Created:** 2026-09-19
**Supersedes:** the M3–M6 roadmap in `PLAN.md` §5 (M0–M2 there remain accurate and done)
**Target:** Android phone (Galaxy S26) first, installed desktop PWA second, no iOS.

---

## START HERE — session handoff (last updated 2026-09-23)

**Status: P0–P3 are done and validated on real hardware. P4 is active: the standalone shell, tool
cards, code/diff rendering, profile selection, blocking approval sheet, and production composer are
implemented. The long-session/navigation pass is next.**

### What exists right now

- **It works.** The app runs on Eric's Galaxy S26 over Tailscale: loads, signs in, streams replies.
- **Live URL:** `http://100.104.221.85:9119` — any browser on the tailnet, installable as a PWA.
  Login `hermes` / `hermes` (Eric's deliberate choice to defer rotation; see "Outstanding" below).
- **Repo:** `/home/eric/projects/hermes-ui` on CT 117 (devbox). Active branch
  `feat/mobile-p4-chat-surface`. `origin` = Eric's fork
  `github.com/epeder1102/hermes-ui`; `upstream` = `przbadu/hermes-ui` (keep it, `UPSTREAM.md`
  documents a re-sync workflow).
- **Android APK** builds on GitHub Actions (`.github/workflows/android.yml`), artifact
  `hermes-debug-apk`. Installed on the S26.

### The one architectural fact to absorb first

**The gateway serves this app's bundle.** `hermes dashboard` on CT 114 runs with
`HERMES_WEB_DIST=/opt/hermes-ui/dist`, so the UI and the API share one origin. Do not try to make the
app call the gateway cross-origin — §3.1 and P3 explain why three plausible designs fail.

**Therefore UI changes do NOT need an APK rebuild.** Build and redeploy:

```
ssh eric@192.168.10.160 'cd ~/projects/hermes-ui/app && NODE_OPTIONS=--max-old-space-size=1400 npx vite build'
ssh eric@192.168.10.160 'tar cz -C ~/projects/hermes-ui/app dist' | sudo pct exec 114 -- tar xz -C /opt/hermes-ui
```

Then just reload the page on the phone. Seconds, not minutes. The APK is a thin shell around that URL.

### Commands that will otherwise waste your time

- **Every** `tsc` / `vitest` / `vite build` on CT 117 needs `NODE_OPTIONS=--max-old-space-size=1400`,
  or Node OOMs against its default heap cap on a 1 GB box. A full `vitest` run takes ~4 minutes.
- Three test files fail on upstream `main` and are excluded by name in CI — see "Inherited test
  debt". Do not widen that into a blanket skip.
- CT 117 is at **~98% disk**. Do not install the Android SDK there; that is why CI exists.

### What P4 actually is

The mobile chat surface, built as a **separate mobile route shell** — NOT a responsive retrofit of
the desktop three-pane layout (§1.1 explains why, including the kill criteria). Reuse the protocol
layer, stores and message/tool-card components; write a new shell around them.

Priority order is in the P4 section below. Short version, most valuable first:
1. Tool-call cards (collapsed one-liners, expand into a bottom sheet — never inline)
2. Code/diff rendering (per-hunk collapse, no-wrap default, virtualize the list)
3. Approval prompts (undismissable sheet, full command text, never middle-elided)
4. Composer (keyboard-aware, safe-area, draft persistence)

Implemented P4 slices as of 2026-09-23:
- **P4.1:** collapsed tool-call cards with a fixed bottom-sheet detail view.
- **P4.2/P4.3:** dedicated code and diff rendering, including no-wrap horizontal scrolling and
  per-hunk collapse.
- **P4.4:** new-session profile selector backed by the dashboard profile list.
- **P4.5:** non-dismissable mobile approval sheet with the complete horizontally scrollable command,
  one-turn/session/permanent allow choices, explicit deny, permanent-choice confirmation, and inline
  RPC failure recovery. The sheet is scoped to the active session so a background request cannot
  hijack the foreground chat.
- **P4.6:** production mobile composer with capped multiline growth, newline-first Enter behavior,
  explicit Ctrl/⌘+Enter submit, session-keyed draft persistence, submit-failure recovery, 48px actions,
  safe-area padding, and `visualViewport` keyboard resizing for Android WebView.

Eric's stated priority is vibe-coding from the phone with the **dev** profile: reading tool output and
diffs, and approving actions. Weight everything toward that; other panels can stay rough.

### KILL CRITERION — ANSWERED 2026-09-20: **yes, proceed. Do not rebuild, do not retrofit.**

The question was whether the message stream + composer could be mounted in a standalone mobile route
*without rewriting the stores*. They can. Evidence, weakest to strongest:

1. **No layout coupling in the data path.** None of the engine hooks — `use-session-state-cache`,
   `use-message-stream`, `use-prompt-actions`, `use-composer-actions`, `use-gateway-boot`,
   `use-gateway-request` — import `store/layout`, `store/panes` or the desktop controller. The only
   two hits anywhere near them are benign: `$pinnedSessionIds` is a `persistentAtom` of session ids
   (data, not pane geometry), and `isSecondaryWindow`/`isWatchWindow` are pure `location.search`
   predicates that return `false` in a normal browser.
2. **State is nanostores, not React context.** `$messages`, `$busy`, `$activeSessionId` are
   module-level atoms, so a sibling route subscribes to identical state with zero provider plumbing.
   The root providers (QueryClient, I18n, Theme, Haptics, HashRouter) are generic and already wrap
   everything.
3. **The codebase already does this.** `useGatewayRequest()` is called today from `floating-pet.tsx`,
   `pet-settings.tsx` and `pet-generate-overlay.tsx` — components outside the desktop controller
   tree that get a working gateway. The socket is owned by the `$gateway` singleton, **not** by
   `desktop-controller.tsx`.
4. **It compiles, mounts and streams.** `app/src/mobile/use-chat-engine.ts` wires the same seven
   hooks in the same order; `app/src/mobile/mobile-app.tsx` renders `$messages` + a composer calling
   `submitText`. `tsc` clean, and `app/src/mobile/mobile-app.test.tsx` (3 jsdom tests) proves the
   engine mounts standalone, that store writes render in it, and that `$gatewayState` drives the
   composer.

**The only change to existing code is 9 lines in `main.tsx`** adding a `?m=1` flag. No store, no
component, no controller file was modified — verified with `git status`. Both shells ship in one
bundle, so the phone can A/B them by toggling the flag.

What `desktop-controller.tsx` (1,418 lines) owns that a mobile shell does **not** need:
`usePreviewRouting` (preview dev-server), `useCwdActions`/`useHermesConfig` (project branch + voice),
`useRouteResume`, `useKeybinds`, and the pet/starmap/overlay wiring. Its coupling is **orchestration,
not layout** — ~150 lines of hook wiring, which is exactly what `use-chat-engine.ts` extracts.

**Probe URL:** `http://100.104.221.85:9119/?m=1` (deliberately unstyled — it is the proof, not the
feature). Branch `feat/mobile-p4-chat-surface`, commit `47da719`, pushed.

### ⚠️ CT 117 build environment — the documented heap flag was a trap (fixed 2026-09-20)

`NODE_OPTIONS=--max-old-space-size=1400` was **fighting the container limit**. CT 117 was capped at
1024MB, so V8 believed it had 1400MB of old-space and never GC'd before the cgroup started swapping.
A `vite build` thrashed so hard that both `ssh` and `pct exec` stopped responding for ~20 minutes.

- **CT 117 `memory` raised 1024 → 3072MB** (live, no reboot; backup `/root/117.conf.bak.20260920-prebuild-ram`
  on the Proxmox host). The build went from thrashing-indefinitely to a few minutes. Use
  `--max-old-space-size=2200` now.
- **CT 117 disk was at 99% (119MB free)** — cleared `~/.npm/_cacache` (1.8GB of regenerable package
  cache, no project files) → 80% / 1.6GB free.
- **Deploy hygiene:** the documented `tar cz | tar xz` redeploy **never removes stale assets**, so
  orphaned `index-*.js` chunks accumulate in `/opt/hermes-ui/dist` forever. Harmless to serving
  (index.html names the live chunk) but it bloats the dir and the PWA precache. Prefer extracting to
  a temp dir and swapping, or `rsync --delete`. Pre-P4 backup of the deployed bundle:
  `/opt/hermes-ui/dist.bak.20260920-prep4` inside CT 114.

### Context that lives outside this repo

- **`/home/claude/CLAUDE.md`** (auto-loaded by Claude Code on the Proxmox host) has a dated
  2026-09-19 section covering the CT 114 changes: the gateway-vs-dashboard distinction, Tailscale in
  CT 114, the bind change, `HERMES_WEB_DIST`, every backup path, and the "don't press Update Hermes"
  warning. That is the homelab source of truth - update it there, not here, for infra changes.
- **`/home/claude/.claude/projects/-home-claude/memory/project-hermes-mobile-app.md`** holds the
  three architectures that failed on device and why each looked correct. Worth reading before
  proposing any change to how the app reaches the gateway.

### Outstanding, not blocking P4

- **Dashboard password is still `hermes`/`hermes`** — Eric's call. Rotation script staged, unrun:
  `sudo pct exec 114 -- /usr/local/lib/hermes-agent/venv/bin/python /root/rotate-dashboard-auth.py`
- `ANDROID_KEYSTORE_B64` repo secret **added 2026-09-19**, so APKs from now on install over the top.
  The keystore itself is `~eric/hermes-debug.keystore` on CT 117 (gitignored - the fork is public).
  **It is the only thing that lets future APKs update in place**; if CT 117 is rebuilt without a copy,
  every later build needs a full uninstall/reinstall.
- `bun.lock` is stale (CI runs unpinned `bun install`); commit a resolved lockfile for reproducibility.
- **Do not press the in-app "Update Hermes" button** — see the version-skew risk below.
- P5 (biometric gate, Keystore credentials, `FLAG_SECURE`) is the reason the APK exists at all; the
  P1 `credential-store.ts` seam is already in place for it.

---

## 0. Recon findings that changed this plan (2026-09-19)

These were verified live against CT 114 and CT 117 before writing anything. Three of them
invalidate assumptions in the original brief, so read this section before the rest.

### 0.1 "Gateway" means two different things — the app talks to the *dashboard*

- `hermes gateway run --profile X` (`hermes-gateway-{default,dev,homelab-admin,financial-advisor}.service`)
  is the **messaging** gateway — the Telegram poller. Verified with `ss -ltnp` inside CT 114:
  **these four processes listen on nothing at all.** No HTTP, no WebSocket.
- The REST + JSON-RPC-over-WebSocket server the UI needs is **`hermes dashboard`**
  (`hermes-dashboard.service`), currently the only listener in CT 114: `0.0.0.0:9119`.
- This is confirmed from the other direction by the repo itself: `app/vite.config.ts` proxies
  `/api`, `/auth`, `/login` to `HERMES_GATEWAY_URL`, whose **default is `http://127.0.0.1:9119`** —
  the dashboard's default port. In this repo's vocabulary, "gateway" == the dashboard server.

**Consequence:** the "give each of the 3 profiles its own network-reachable gateway" question is moot.
There are no per-profile HTTP servers to expose.

### 0.2 The dashboard is machine-level and multi-profile by default

From `hermes dashboard --help`:

> `--isolated`  When launched from a named profile, run a dedicated dashboard server scoped to that
> profile instead of routing to the machine dashboard. **Default behavior is unified: profile
> launches attach to (or start) ONE machine-level dashboard and preselect the profile in the UI's
> profile switcher.**

**Consequence:** one already-running process serves all profiles. The app needs **one** endpoint, not
three. Zero new processes, zero added RAM. This is strictly better than the three-tunnel design and
it is what we built against.

> **⚠️ CORRECTION (2026-09-20) — "profile switching built in" is right about the outcome but wrong
> about the mechanism, and the wrong mechanism is the one you will reach for first.**
>
> Switching is **not per-socket**. Verified against the running system:
> - The dashboard process is scoped to **one** profile via `HERMES_HOME`. `hermes-dashboard.service`
>   sets no override, so it runs as `default`. `POST /api/profiles/active` says in its own docstring
>   that it "does not retarget the already-running dashboard process".
> - The web bridge's `connection(profile)` returns the **same** `baseUrl` for every profile, and
>   `getGatewayWsUrl()` takes no profile argument. So `ensureGatewayForProfile` → `openSecondary`,
>   which reaches a per-profile backend in Electron, opens a second socket to the **same** default
>   backend in a browser. The `profile` field on the connection is cosmetic there.
> - `tui_gateway/ws.py` contains the string `profile` **zero** times.
>
> Switching is **per session**. `session.create` accepts a `profile` param (the gateway's
> "app-global remote mode"): `tui_gateway/server.py` resolves it with `_profile_home()`, stores
> `profile_home` on the session, and `_start_agent_build` re-binds `HERMES_HOME` around every turn so
> config, skills, model and `state.db` resolve to that profile. `selectProfile()` sets
> `$newChatProfile`; `createBackendSessionForSend` already passes it through.
>
> Practical upshot: a profile switch applies to the **next** session and cannot move an existing
> conversation. Implemented in `mobile/profile-sheet.tsx` (P4.4) with no protocol work — only UI,
> plus two effects the mobile engine was missing (`$freshSessionRequest` → `startFreshSessionDraft`,
> and `refreshActiveProfile()` on gateway open).

**Security consequence (the bad half):** one credential reaches every profile including
`homelab-admin`. There is no per-profile credential boundary in unified mode. See §3.4.

### 0.3 `--insecure` is a no-op; auth is real but weak

`hermes-dashboard.service` still passes `--insecure`, which as of the June 2026 hardening is
**DEPRECATED / NO-OP** — a non-loopback bind always requires an auth provider now. Verified:
unauthenticated `GET /api/profiles` on `192.168.10.130:9119` returns
`401 {"error":"unauthenticated","reason":"no_cookie"}`.

So auth is enforced — but it is `dashboard.basic_auth`, username `hermes`, a weak shared password,
`session_ttl_seconds: 2592000` (**30 days**), reachable from **every device on the LAN**, and behind
it sits a profile with passwordless root on the whole homelab. This is the single largest security
problem in the current setup and it predates this project.

### 0.4 CT 114 has no room for anything

- `df -h /` → **7.8G total, 63M free, 100% used**
- `free -m` → 753/1024 MB used, **swap 512/512 MB full**
- `hermes dashboard` RSS: **~110 MB**

**Consequence (superseded 2026-09-19):** this was the blocker on giving `homelab-admin` its own
credential. **CT 114 has since been grown to 16 G (41% used) with RAM headroom, so a second
`--isolated` dashboard at ~110 MB is now affordable** and should be taken - it is the only way to get
a real server-side boundary between `dev` and root. Original text: a second dashboard would
cost ~110 MB and could not be afforded. That option is deferred behind the CT 114 growth work
already in the homelab backlog, and §3.4 specifies the interim mitigation.

### 0.5 The devbox (CT 117) constraints

- **`tsc` OOMs at Node's default heap cap.** CT 117 has 1 GB RAM, so Node defaults to a ~512 MB
  old-space and typecheck dies with `FATAL ERROR: Reached heap limit`. It passes with
  **`NODE_OPTIONS=--max-old-space-size=1400`** (it swaps, but it completes). Use that for every
  `tsc`/`vitest`/`vite build` invocation on CT 117, or add it to the npm scripts.
- **Disk: 7.8 G total, ~253 MB free (97%).** `app/node_modules` alone is 767 MB.
- **Capacitor cannot be built here.** An Android build needs the Android SDK + Gradle (several GB).
  There is no room, and no EAS-style cloud builder for Capacitor the way `frigate-mobile` uses EAS.
  **P3 needs a build-host decision** — the realistic options are GitHub Actions on a fork of this
  repo (preferred: no local disk cost, reproducible, and the repo is already a GitHub clone), or
  growing CT 117's disk (`pct resize`, which is **not reversible** — an LXC disk cannot be shrunk).

### 0.6 Protocol facts confirmed from `app/src/web-bridge/bridge.ts`

Two P0 gates are now answered definitively, from the bridge's own header comment:

- **WS tickets are single-use with a 30 s TTL**, minted per connect via `POST /api/auth/ws-ticket`.
  `authMode: 'oauth'` makes the renderer re-resolve the URL on every reconnect, and
  `resolveGatewayWsUrl()` in `shared/src/websocket-url.ts` re-mints before every connect. **The
  reconnect discipline this plan calls for is already implemented correctly** — that risk is lower
  than originally written. Do not regress it when adding backoff in P6.
- **Auth modes:** loopback/token gateways inject `window.__HERMES_SESSION_TOKEN__` into the served
  HTML; REST sends `X-Hermes-Session-Token` and WS uses `?token=`. Gated gateways use the cookie jar
  same-origin plus per-connect WS tickets.

### 0.7 The constraint that shapes P1: `resolveToken()` is synchronous

`bridge.ts:resolveToken()` is a synchronous function — every REST call and WS URL build reads the
token inline. **Android Keystore / EncryptedSharedPreferences reads are asynchronous.** A synchronous
resolver can therefore never read from secure storage directly, and this would have surfaced as a
blocking rewrite in P5 rather than a design choice in P1.

Resolution: **hydrate-at-boot.** A `CredentialStore` owns persistence and may be async; a one-time
`hydrateCredentials()` pulls values into an in-memory cache before mount; `peekCredential()` stays
synchronous against that cache, so the existing call graph is untouched. `lockCredentials()` zeroes
the cache without touching persistence — which is exactly the admin-profile lock in §3.5: the token
remains stored but unreadable until a fresh biometric re-hydrates it.

On the web the backend is `localStorage`, reads are genuinely synchronous, and `peekCredential()`
falls through to a direct read, so **web behaviour is unchanged and boot order cannot matter.**

---

## 1. Decision: keep `hermes-ui`

**Keep it.** Reasoning, in priority order:

1. **The expensive asset is the protocol client, not the UI.** A faithful client for the
   JSON-RPC-over-WS surface — streaming deltas, tool-call lifecycle, and the clarify/approval/sudo/
   secret prompt types, plus sessions, cron, model switching, skills, MCP, artifacts — is the hard
   part, and that protocol is unversioned and moves with upstream. Reimplementing it elsewhere means
   owning a second implementation of an undocumented moving target, alone, forever.
2. **The riskiest milestone is already passed.** M1 verified boot/auth in both token and cookie
   modes and confirmed WS streaming against a real server. That is where these projects die.
3. **There is no auth model in this code to fix.** It ships zero backend; every request goes to the
   dashboard. Its only security-relevant responsibility is *where the credential lives*, which is a
   single storage seam (§4, P1). The security bar is met at the transport, server, and OS-keystore
   layers — all outside this codebase. If this repo had rolled its own session layer the answer
   would be the opposite.
4. A third restart, after this repo already superseded a build-fresh plan and a Flutter plan, has a
   high probability of stalling exactly where we already are.

### 1.1 The honest caveat and the kill criteria

The reuse argument is strong for the non-visual layer and weak for the layout shell. `app/src` is a
desktop three-pane renderer with responsive tab collapsing — not a mobile app in a narrow window.

> **Do not do the mobile pass as a responsive retrofit of the three-pane shell.** Build a separate
> mobile route shell for the chat surface, reusing the protocol layer, stores, and the message /
> tool-card components. Leave the desktop shell intact for the desktop-PWA case.

**Kill criteria, evaluated at the end of P3:** if the chat state turns out to be so entangled with
the desktop layout that the message stream + composer cannot be mounted in a standalone mobile route
without rewriting the stores, then scrap the shell, keep the protocol layer as a library, and
rebuild the UI. Everything in P0–P3 is useful under either outcome.

---

## 2. Decision: Capacitor, and drop the TWA

**Capacitor, confirmed** — and for a stronger reason than code reuse.

Capacitor's Android WebView serves the app from a **`localhost` origin**. The dashboard hardcodes
CORS to localhost and rejects foreign http(s) origins on the WS upgrade (close code 4403). So the
native shell does not *work around* the same-origin lock — **it lands inside it.** No reverse proxy,
no Origin rewriting, no TLS termination, no cookie-scoping puzzle, no server-side changes. Capacitor's
native HTTP client additionally bypasses CORS for REST.

> **P0 must verify precisely** whether the CORS allowlist and the WS origin check compare
> scheme+host+port or host only, and which `androidScheme` lands inside the allowlist. This is the
> single load-bearing assumption in the plan.

**Drop the TWA.** The original M6 had TWA first, Capacitor as fallback. That is backwards: a TWA is
Chrome and presents a real `https://` origin — exactly what the WS origin check rejects — so
TWA-first means solving the same-origin problem that Capacitor makes vanish. A TWA also gives no
hardware-backed keystore, no biometric gate, no `FLAG_SECURE`, and no control over background socket
lifetime. The local-unlock requirement alone makes native mandatory.

**Not Expo/React Native**, for the protocol-ownership reason in §1. RN only wins in a green-field
rebuild, which this is not.

**No Play Store.** An app that can execute root commands on the homelab has no business with a
public listing, a data-safety declaration, or a review queue. Signed APK, sideloaded, with Play
Internal App Sharing if painless updates are wanted later. This deletes a milestone and shrinks
exposure. Revisit only if other household members need it.

---

## 3. Decision: network exposure and auth

### 3.1 CORRECTION (2026-09-19): a loopback bind DISABLES authentication

The original version of this section proposed binding the dashboard to `127.0.0.1` and exposing it
through a host-side SSH tunnel. **That is wrong and would have been a serious regression.** From
`hermes_cli/web_server.py`:

- `should_require_auth(host)` returns **False for a loopback bind** — "no auth - local-only, trusted
  operator". Auth only engages on a non-loopback bind. RFC1918/CGNAT/link-local are deliberately
  treated as PUBLIC, which is the behaviour we want.
- `host_header_middleware` + `_is_accepted_host()` reject any request whose `Host` does not match the
  bound interface (anti-DNS-rebinding, GHSA-ppp5-vxwm-4cf7). A tunnel presenting
  `Host: 100.80.182.126:9119` to a loopback-bound server is rejected with 400.

So loopback + tunnel would have either 400'd every request or, if the Host check were satisfied,
served the whole tailnet **with no authentication at all**. Do not do it.

A second, subtler point: `_is_accepted_host()` returns `True` for *any* Host when the bind is
`0.0.0.0` ("no protection possible at this layer"). The pre-existing `--host 0.0.0.0` therefore also
disabled the rebinding defence.

### 3.2 Target topology (corrected)

Keep a **non-loopback bind** so the auth gate stays engaged, and narrow it.

| Component | Bind | Auth gate | Host-header defence |
|---|---|---|---|
| `hermes dashboard` (was) | `0.0.0.0:9119` | on | **off** (0.0.0.0 accepts any Host) |
| `hermes dashboard` (now) | `192.168.10.130:9119` | on | **on** |
| `hermes dashboard` (target) | CT 114's tailnet IP | on | on |

**No SSH tunnel is needed.** The Proxmox host already advertises the `192.168.10.0/24` subnet route,
so the phone reaches CT 114 over Tailscale today. Verified: the host's `ts-postrouting` chain
MASQUERADEs subnet-route traffic, so tailnet clients arrive at CT 114 sourced from `192.168.10.10`.

### 3.3 Reachability — DONE 2026-09-19

Tailscale now runs inside CT 114, which joined the tailnet as **`hermes` = `100.104.221.85`**, and
the dashboard binds **only** to that address. Implemented:

- `/dev/net/tun` passthrough added to `114.conf` (same pattern CT 110 uses); backup
  `/root/114.conf.bak.20260919-tailscale`.
- `tailscale` 1.102.4 installed in CT 114, `tailscaled` enabled.
- `hermes-dashboard.service` `ExecStart` now `--host 100.104.221.85 --port 9119 --no-open`
  (was `--host 0.0.0.0 ... --insecure`); backup `hermes-dashboard.service.bak.20260919-bindauth`.

**Verified:**

| Check | Result |
|---|---|
| `192.168.10.130:9119` (LAN) | **connection refused** — LAN exposure gone |
| `100.104.221.85:9119/api/profiles` (tailnet) | `401` — listening, auth gate engaged |
| `/login` with `Host: evil.test` | `400` — rebinding defence active |
| `/login` with correct Host | `200` |

Note the auth middleware runs before the host check on `/api/` paths, so a bogus Host there returns
401 rather than 400. Test the Host defence on a public path such as `/login`, or the result is
misleading.

**The raw tailnet IP is used deliberately, not the MagicDNS name.** `_is_accepted_host()` compares
the Host header against the bound interface, so `Host: hermes.<tailnet>.ts.net` against an IP-bound
server is rejected with 400. This also matches the FuelTracker lesson that MagicDNS names fail inside
a release APK. **Caveat:** if CT 114's tailnet IP changes, the bind, the app's saved gateway entry and
`app/android-overrides/network_security_config.xml` must all be updated together.

**Consequences to accept:**

- The Windows desktop app must now point at `http://100.104.221.85:9119` **with Tailscale running**,
  even at home. `lappytoppy` is already a tailnet node. Remember the documented gotcha that Tailscale
  and ProtonVPN together break that laptop's connectivity.
- **Disable key expiry for the `hermes` node** in the Tailscale admin console. Tailscale node keys
  expire by default (~180 days); when it lapses the dashboard becomes unreachable with no obvious
  cause. Servers should be set to never expire.
- Tailnet devices are now part of the TCB for this surface. `pixel-7` is still a member despite the
  phone migration — worth removing.

### 3.4 Auth — three layers, and one honest gap

1. **Tailscale device identity + ACLs.** This is the strong per-device credential: a WireGuard
   keypair per device, no shared secret, revocable in one click. Replace the default allow-all
   policy with a port-level grant for `100.80.182.126:9119` limited to the phone and the laptop.
2. **Dashboard credential — must be replaced.** `hermes`/`hermes` is not acceptable in front of
   `homelab-admin`. Rotate `dashboard.basic_auth` to a long random password stored in the phone's
   Keystore and in the laptop's password manager, and drop `session_ttl_seconds` from 30 days
   (see §3.5). Also drop the now-meaningless `--insecure` flag from the unit.
3. **App-level unlock**, gating the admin profile specifically (§3.5).

**The gap, stated plainly:** in unified mode one dashboard session reaches every profile. There is no
server-side credential boundary between `dev` and `homelab-admin`. Layer 3 is therefore a *client-side*
control — it raises the bar against a lost/stolen phone, but it does not stop an attacker who has
extracted the session cookie and talks to the API directly.

**The real fix** is a second `--isolated` dashboard bound to its own port, with its own password and
a tighter Tailscale ACL, serving only `homelab-admin`. It costs ~110 MB RSS, which CT 114 does not
have today (§0.4). **Recommendation: take it as soon as CT 114 is grown**, and treat the interim as a
known, documented compromise rather than a solved problem.

### 3.5 Session and token policy

| | default / dev | homelab-admin |
|---|---|---|
| Dashboard `session_ttl_seconds` | 7 days (down from 30) | 7 days, and see below |
| Credential storage | EncryptedSharedPreferences, Keystore-wrapped | same, but Keystore key created with `setUserAuthenticationRequired(true)`, ~60 s validity |
| Unlock to use | biometric/PIN on cold start; re-prompt after 8 h idle | **biometric/PIN on every entry into the profile**, and again after 5 min backgrounded |
| Survives process death | yes | **no** — admin selection is dropped on app kill |
| Visible when locked | — | **hidden from the profile switcher until unlocked** |
| `FLAG_SECURE` | no | **yes** — no screenshots, blank recents thumbnail |
| Approvals | normal | **no "remember this choice", no batch-approve**; full command text rendered before the approve button; approve disabled ~700 ms after render to defeat tap-through |

Rationale for 7 days over 30: a stolen phone that somehow gets past the biometric gate goes dark
within a week with no action required. The Keystore 60 s auth window means the credential ciphertext
is undecryptable at rest — even to code running as the app — without a fresh biometric.

---

## 4. Sequenced build plan

Ordered for the stated priority: **dev-profile chat / tool-calls / approvals excellent on mobile,
before feature-gating rarely-used desktop panels.**

### P0 — Recon and gates (mostly done)
- [x] Confirm what actually listens in CT 114 → §0.1
- [x] Confirm dashboard is unified/multi-profile → §0.2
- [x] Confirm auth is enforced and what it is → §0.3
- [x] Measure CT 114 headroom and dashboard RSS → §0.4
- [x] Record upstream watermark → `UPSTREAM.md`: extraction `56a8e81` (2026-07-08), last full sync
      `f0aae14` (2026-07-20), Bot Mode ported from `v2026.8.18`. PR2 architectural sync still deferred.
- [ ] **Verify the Capacitor origin assumption** (§2) — the load-bearing unknown.
- [ ] Confirm whether WS connect tickets are single-use and their TTL.
- [ ] Assess separability of chat state from the desktop shell (feeds §1.1 kill criteria).

### P1 — Transport + secure-credential seam
The security core. Before any UI work, because everything depends on it.

- [x] **`CredentialStore` seam** — `app/src/web-bridge/credential-store.ts` (+ tests). Backends:
      `MemoryCredentialStore` (tests / locked state), `LocalStorageCredentialStore` (dev + desktop
      PWA only), `SecureCredentialStore` (Keystore adapter injected, wired in P5).
      `setCredentialStore()` **throws** if something tries to use `localStorage` on a native
      runtime, so a misconfigured build fails loudly instead of silently writing plaintext.
- [x] **`bridge.ts` routed through the seam** — the two direct `localStorage` token accesses now go
      via `peekCredential()` / `setCredential()`. Same storage key, so no migration.
- [ ] Extract a single `GatewayClient` module: REST + WS, ticket acquisition, reconnect/backoff, event
  decoding. One boundary, no UI imports. This is the asset that survives a UI rewrite.
- Introduce a `CredentialStore` interface with three implementations: in-memory (tests),
  `localStorage` (desktop dev only, explicitly marked non-production), and Android Keystore-backed.
  Audit that no credential touches `localStorage` on the native build.
- **Record protocol fixtures now** — capture real WS frames for a full streaming turn, a tool call,
  and each of the four prompt types, into JSON fixtures, and build a replay test. When upstream
  drifts, these tell you *what* broke instead of "the app is weird now."

### P2 — Network path
- `hermes-ui-tunnel.service` on the host; verify binds with `ss -ltnp`.
- Rotate the dashboard credential; drop `--insecure`; lower `session_ttl_seconds`.
- Rebind dashboard `0.0.0.0` → `127.0.0.1`.
- Tighten Tailscale ACLs.
- ⚠️ **Rebinding and ACL tightening can cut off access** — including the Windows desktop app, which
  currently reaches `192.168.10.130:9119` over the LAN. Both are stop-and-ask changes. Use Tailscale's
  ACL tests/preview before saving, keep an explicit laptop allow rule, and keep a host console open.

### P3 — Capacitor shell — DONE 2026-09-19, validated on device

**Validated end to end on the Galaxy S26 over Tailscale:** UI loads, sign-in works, the status bar
reports "Gateway ready" (WebSocket connected), and a message to the agent streamed a reply back.

**Architecture changed during P3 — read this before P4.** The original design (local bundle in the
APK, calling the gateway cross-origin) does not work, for two stacked reasons found on device:

1. `gateways.ts:classifyGatewayReach()` is a deliberate guard that refuses a cross-origin gateway in
   the web build ("Gateway must be same-origin"). It is correct, not a bug.
2. Even bypassed, the dashboard's session cookie is host-only `SameSite=Lax`, which a browser will
   not send cross-origin. The app would pass the guard and then fail to authenticate.

Resolved by using the model the project recommends: **the gateway serves this bundle** via
`HERMES_WEB_DIST` (`web_server.py:116`), so UI and API share one origin and the entire class of
problem disappears - no CORS, no cookie SameSite, no mixed content, no WS origin question.

Deployed: bundle at `/opt/hermes-ui/dist` on CT 114; `Environment="HERMES_WEB_DIST=/opt/hermes-ui/dist"`
in `hermes-dashboard.service` (backup `.bak.20260919-webdist`). The stock bundle is untouched on
disk - removing the env var reverts. Capacitor sets `server.url` to the gateway.

**Consequences for P4, both good:**
- The APK is a thin shell. **UI changes ship by rebuilding `dist/` and copying it to CT 114 - no APK
  rebuild, no reinstall.** Redeploy:
  `ssh eric@192.168.10.160 'tar cz -C ~/projects/hermes-ui/app dist' | sudo pct exec 114 -- tar xz -C /opt/hermes-ui`
- The UI is now also a desktop PWA for free: any tailnet browser can open
  `http://100.104.221.85:9119`. P7 is effectively already satisfied, without the reverse proxy.

Also learned: `androidScheme` must be `http`, not `https` - an https page cannot call the plaintext
gateway (mixed content) nor open a `ws://` socket.

### P4 — Mobile chat surface ← where the quality goes
A new mobile route shell. Priority order within it:
1. **Tool-call cards.** Collapsed to one line (tool, target, status, duration). Expand into a bottom
   sheet, not inline growth — inline expansion destroys scroll position on a phone. Stream stdout
   into a fixed-height scrollable region with jump-to-end. Hard line budget with "show all" opening
   full screen.
2. **Code and diff rendering.** Disproportionate effort goes here. Per-hunk collapse; sticky filename
   header; wrap/no-wrap toggle defaulting to no-wrap with horizontal scroll (wrapped diffs are
   unreadable); syntax highlighting with a strict token budget that bails to plain mono rather than
   janking; tap-to-fullscreen with landscape; copy-block. Virtualize the message list *before* there
   is a 500-message session.
3. **Approval prompts.** A bottom sheet that cannot be dismissed by backdrop tap. Full command text
   in monospace, horizontally scrollable, never middle-elided. Approve / Deny / more-context. Admin
   gets the §3.5 hardening.
4. **Composer.** Keyboard-aware, safe-area insets, capped multiline growth, send-on-enter off by
   default, draft persistence across backgrounding.
5. Bottom nav, sheets instead of popovers, 44dp+ targets, swipe actions only where unambiguous.

### P5 — App lock, profile switcher, admin gating
Biometric/PIN gate, the §3.5 policy table, `FLAG_SECURE` on admin screens, `allowBackup=false`,
hide-on-recents. Profile switcher maps onto the dashboard's own profile list (§0.2), not onto
separate endpoints.

### P6 — Lifecycle, feature gating, everything else
- **Background socket lifecycle** — the thing most likely to make the app feel broken. Doze and
  WebView backgrounding will kill the WS. On resume: re-fetch a ticket, reconnect, and
  **reconcile the session from REST** rather than trusting the socket to have missed nothing. Explicit
  "reconnecting" state; never silently drop stream content. Decide deliberately whether a foreground
  service is wanted so long tool runs survive screen-off.
- Original M3: hide/disable Electron-only surfaces (local terminal, native file dialogs, pop-outs,
  auto-update, pet overlay) so nothing is a dead button.
- Remaining panels (sessions, cron, skills, MCP, settings, artifacts) get functional mobile treatment,
  not polish.

### P7 — Optional: desktop browser PWA
Caddy on the host, tailnet-bound, TLS via `tailscale cert`, serving the static bundle and proxying
`/api` + `/ws` on one origin, **rewriting the `Origin` header** to the dashboard's expected localhost
value on the WS upgrade. That rewrite is the linchpin that makes the reverse-proxy model work without
server changes. Justify it or skip it — it is the only new always-on listener in the design.

---

## 5. Risks and gotchas

**Protocol and upstream**
- **Unversioned WS events.** Mitigated by the P1 fixture corpus + replay tests. Pin upstream, re-sync
  deliberately (not opportunistically), re-record fixtures each time.
- **Upstream drift is already real.** `UPSTREAM.md` records a deferred "PR2" architectural sync: the
  tree layout engine, `store/session-states`, the expanded `types/hermes.ts` surface, and the
  `@assistant-ui/react` 0.12→0.14 major. The longer that sits, the worse it gets — and the mobile
  shell in P4 should be written so it does not depend on the pre-tree `pane-shell`, or P4 will have
  to be redone when PR2 lands.
- **Single-use connect tickets.** Never reconnect without a fresh ticket. Serialize ticket
  acquisition behind a mutex so a reconnect storm cannot burn tickets in parallel. Treat
  ticket-reuse/4403 as full re-auth, not retry. Exponential backoff with jitter.
- **Mobile app lifecycle killing sockets.** See P6. Assume the socket is dead on every resume.

**Backend/frontend version skew (found 2026-09-19)**
- The UI reports "Backend out of date". It is real: backend is `v0.17.0 (2026.6.19)`, the UI is built
  from upstream desktop code of 2026-07-20 with Bot Mode from `v2026.8.18`.
- **Do not press the in-app "Update Hermes" button.** This install is heavily customised
  (`upstream 7f3e0bb5 · local 88b3d863 (+12899 carried commits)`), and an update would touch the four
  gateway profiles and their Telegram bots, the deliberately pinned Mnemosyne 3.14.0, the Obsidian
  MCP tunnel, the openai-codex credential pool and `dashboard.basic_auth`. CLAUDE.md also records
  `hermes update` hanging in D-state here.
- Everything exercised so far works. Treat it as advisory; if a specific feature misbehaves, diagnose
  that feature. A backend upgrade is its own planned job (vzdump first, verify all four profiles with
  real `hermes -z` calls after).

**Inherited test debt (found 2026-09-19)**
- Five tests across three files fail on upstream `main` as extracted, with none of this project's
  code involved: `gateway-connecting-overlay.test.tsx` (3 - `useNavigate()` used outside a
  `<Router>`), `pane-shell.test.tsx` (1 - widthOverride expects 320px, gets 240px), and
  `use-prompt-actions/index.test.tsx` (1 - session-resume payload gained a `source` field).
- CI excludes those three files **by name** so the other ~1245 tests still gate the build. Do not
  widen that into a blanket `continue-on-error` - a real regression must still fail CI.
- The pane-shell one is likely the pre-tree `pane-shell` this repo still carries; expect it to
  resolve or change shape when the deferred upstream "PR2" sync lands.

**This environment**
- **CT 114 rootfs is 100% full and swap is 512/512.** This will cause failures on its own and blocks
  the isolated-admin-dashboard fix in §3.4. Needs resolving independently of this project. Nothing in
  this plan builds or stores anything in CT 114 — builds happen on CT 117 per the standing rule.
- **SSH tunnel fragility under I/O contention.** The Obsidian MCP tunnel already died once when a 12 h
  vzdump starved VM 116's sshd past the keepalive. Same class of failure applies. Hence the tolerant
  keepalives in §3.1 plus a watchdog. Expect it to trip during backup windows.
- **A phone tap runs arbitrary commands on CT 117 as `eric`, who has passwordless sudo.** That is the
  *dev* profile, not just admin — so dev's approval UX is security-relevant even though its session
  policy is looser.

**Architecture-specific security**
- **The tailnet is now part of the TCB for root access.** Any compromised tailnet device can reach
  port 9119. Port-level ACLs are load-bearing, not optional. Audit the tailnet device list and drop
  anything stale before starting.
- **No server-side boundary between dev and admin** (§3.4). Documented compromise until CT 114 grows.
- **Secrets flow through the app.** The `secret`/`sudo` prompt types mean credentials get typed into
  this UI. Ensure they never land in message history, local logs, crash reports, or the clipboard.
- **Tool output leaks.** Admin output contains keys and config. `FLAG_SECURE` covers screenshots and
  recents; also disable WebView debugging in release builds and confirm nothing reaches `logcat`.
- **Capacitor "secure storage" plugins vary wildly.** Several popular ones are thin `SharedPreferences`
  wrappers with a hardcoded key. Verify the chosen one uses `EncryptedSharedPreferences` with a
  Keystore-generated key by reading the plugin source, not the README.

---

## 6. Validation against real hardware

**P2 — network properties** (the ones worth doing carefully)
- Inside CT 114: `ss -ltnp` shows 9119 on `127.0.0.1` only. Any `0.0.0.0` is a failure.
- On the host: `ss -ltnp` shows 9119 bound to `100.80.182.126` only — not `0.0.0.0`, not `192.168.10.10`.
- From a LAN device **not** on Tailscale: `nc -vz 192.168.10.130 9119` → refused. This is the check
  that proves the current exposure is closed.
- From the phone with **Tailscale off** on home WiFi: cannot connect. Tailscale on: connects. This is
  the clearest single demonstration that the VPN is the only path.
- From the phone on **cellular, WiFi off**: connects with Tailscale, fails without.
- External: `nmap` the WAN IP from a cloud box — nothing new open. Confirm no new ER605 port forward.
- ACLs: `tailscale ping` from a device that should *not* reach 9119, plus Tailscale's ACL tests,
  before and after.

**P3 — end to end.** A real streaming turn from cellular; a tool call executing on CT 117; an
approval round trip. Watch `journalctl -u hermes-dashboard` in CT 114 to confirm it is genuinely the
app driving it.

**P4 — the quality bar.** Load a session with a 2000-line diff and 500 messages and scroll it. Run a
tool emitting 10k lines of stdout. Read a real code review on the phone in daylight. If the phone is
not preferable to walking to the desk, it is not done.

**P5 — the security properties**
- **Credential at rest:** attach WebView devtools to the release build; confirm no credential in
  `localStorage`/`sessionStorage`/IndexedDB. `adb shell run-as` → denied on a release build.
  `adb backup` → nothing (`allowBackup=false`). Dump `shared_prefs` XML and confirm ciphertext.
- **Biometric gate:** cold start → admin absent from the switcher. Fail biometric 3× → still absent.
  Confirm the failure is a Keystore `UserNotAuthenticatedException` — i.e. the credential is
  *cryptographically* unavailable, not merely UI-hidden. That distinction is the whole point.
- **Lost phone:** remove the device in the Tailscale console, then try the app **from that phone** —
  every profile fails at the network layer regardless of credential validity. Then rotate the
  dashboard password and confirm the old session 401s. Time both; the goal is a practiced
  "under 30 seconds to fully revoke", not a theory.
- **Shoulder-surf / recents:** screenshot the admin screen → blocked. Background → blank thumbnail.
  Background 6 min → biometric required on return.
- **Session expiry:** confirm a 7-day-old session is rejected rather than silently renewed.

**P6 — lifecycle.** Start a long tool run, lock the screen 10 minutes, return: reconnects with a
complete transcript and no silently dropped output. Toggle airplane mode mid-stream. Switch
WiFi↔cellular mid-stream.
