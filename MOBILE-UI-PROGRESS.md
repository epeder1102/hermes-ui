# Mobile UI Stabilization Progress

Last updated: 2026-09-23

## Repository state

- Host: `devbox`
- Repository: `/home/eric/projects/hermes-ui`
- Branch: `feat/mobile-p4-chat-surface`
- Last shipped commit before this fix: `b76c178` (`feat(mobile): add conversation navigation`)
- Current live asset before this fix: `index-xpCXDv_o.js`
- User screenshot: `/root/.hermes/profiles/dev/cache/images/img_7553b5dedfce.jpg`

## User-visible failure

Opening the three-lines/conversation button produces a translucent drawer over the chat and immediately opens the Android keyboard. The drawer content then competes visually with the chat behind it and has very little usable vertical space.

## Confirmed root causes

1. `app/src/mobile/session-drawer.tsx` builds its drawer background with `var(--primary)` and uses `var(--primary)` / `var(--primary-foreground)` throughout.
2. Those variables are not defined in `app/src/styles.css`. The established theme tokens are `--dt-primary` and `--dt-primary-foreground`.
3. Because the undefined variable appears inside the drawer's single `background` shorthand/gradient, Android WebView rejects the property and the drawer has no opaque surface.
4. The open effect programmatically focuses the search input with `requestAnimationFrame`, which raises the software keyboard immediately. This is especially damaging on the phone because it compresses the drawer before the user asks to search.

## Fix in progress

- [x] Add a regression test that the drawer does not autofocus search on open.
- [x] Add a regression/source assertion that the drawer has a standalone opaque background color using defined theme tokens.
- [x] Replace every undefined `--primary` token in the drawer with `--dt-primary` and every `--primary-foreground` with `--dt-primary-foreground`.
- [x] Split the drawer surface into an opaque `backgroundColor` plus optional `backgroundImage`, so an unsupported/invalid gradient cannot make the sheet transparent.
- [x] Remove automatic search focus. Search remains available after an explicit tap.
- [x] Run focused tests, lint, full CI-compatible tests, TypeScript, and production build.
- [ ] Commit and push.
- [ ] Deploy atomically, verify the authenticated live bundle, and record its asset hash here.
- [ ] Ask Eric to force-close/reopen and verify on the Galaxy S26; source/build/live-bundle verification is not physical-device acceptance.

## Evidence gathered

- Screenshot inspection confirms underlying chat/header content is visible through the drawer.
- Source inspection found the drawer background at `session-drawer.tsx` uses a gradient containing `var(--primary)`.
- Search of `app/src/styles.css` found no declaration for `--primary` or `--primary-foreground`.
- `app/src/styles.css` defines `--dt-primary`, `--dt-primary-foreground`, `--background`, `--foreground`, and `--ui-chat-surface-background`.
- `session-drawer.tsx` explicitly focused `searchRef.current` on open.
- The new regression test failed before the implementation because the drawer had no standalone `backgroundColor`.
- After the implementation, 17/17 focused mobile tests passed, ESLint passed, and the TypeScript/production build passed.
- The complete CI-compatible run passed 1,353 tests and reported 5 unrelated failures. A detached worktree at untouched commit `b76c178` reproduced the same 5 failures (gateway overlay lacks Router context, pane width override expectation, and prompt resume expectation includes a new `source` field), proving this drawer fix did not introduce them.
- New local production entry asset: `index-BiIDdlR0.js` (not yet deployed at this checkpoint).

## Exact next step

Run the full CI-compatible Vitest suite, inspect the final diff, then commit/push and deploy atomically.
