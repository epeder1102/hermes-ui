# Mobile UI Stabilization Progress

Last updated: 2026-09-23

## Repository and deployment state

- Host: `devbox`
- Repository: `/home/eric/projects/hermes-ui`
- Branch: `feat/mobile-p4-chat-surface`
- Virtualization commit: `d162502` (`feat(mobile): virtualize long conversations`)
- Follow-up correctness commit: `b4d79a3` (`fix(mobile): preserve transcript message semantics`)
- Current live asset: `index-BGv07OLR.js`
- Live asset SHA-256: `306a45459f355a5c14cef44c47c7ed13047dc156226755187679d52aa1822f65`
- Rollback backup: `/opt/hermes-ui/dist.backup-20260923-165702`

## Completed slice: P4.8 long-session transcript

- [x] Replace the unbounded `messages.map` transcript with `@tanstack/react-virtual` variable-height virtualization.
- [x] Keep the mobile DOM bounded for a 500-message transcript (fewer than 40 rows in the regression fixture).
- [x] Measure rich/variable-height message rows and retain overscan for smooth phone scrolling.
- [x] Open initial history and switched sessions at the newest message.
- [x] Follow streaming growth only while the reader remains near the bottom.
- [x] Release bottom lock when the reader scrolls into history so streaming cannot yank the viewport.
- [x] Add a 44px accessible `Jump to latest message` control that restores bottom lock.
- [x] Avoid smooth-scroll races while row heights are changing.
- [x] Provide a newest-message fallback window before `ResizeObserver` reports a WebView viewport and in jsdom.
- [x] Filter `hidden` chat records before virtual indexing/rendering.
- [x] Mark a tool as running from its owning message's `pending` state rather than global session `busy`, preventing historical unresolved cards from appearing active during a later turn.
- [x] Update `MOBILE-PLAN.md` to record P4.8.
- [x] Commit, push, build, deploy atomically, and verify the live bundle.

## Validation evidence

- Focused mobile suite: **16/16 passed** (`src/mobile/mobile-app.test.tsx`).
- TypeScript: passed (`npx tsc -p . --noEmit`).
- ESLint: passed for the modified implementation and test files.
- Production Vite/PWA build: passed; generated `index-BGv07OLR.js`.
- Full jsdom suite: **1,357 passed / 1,362 total**. The remaining five failures are the same known baseline failures previously reproduced before this slice:
  - three gateway connecting-overlay tests lacking their expected routing/state conditions;
  - one pane width-override expectation;
  - one prompt recovery expectation that omits the newer `source` field.
- Android CI for `d162502`: passed — <https://github.com/epeder1102/hermes-ui/actions/runs/35916944412>.
- Android CI for final commit `b4d79a3`: passed — <https://github.com/epeder1102/hermes-ui/actions/runs/35922639758>.
- Atomic deployment completed with the previous bundle retained at `/opt/hermes-ui/dist.backup-20260923-165702`.
- Live public endpoint returned HTTP 200.
- Direct live fetch of `/assets/index-BGv07OLR.js` matched the deployed file byte-for-byte and contained both `Jump to latest message` and `Conversation messages` markers.
- `/api/status` returned HTTP 200 when called with the dashboard session token.

## Files changed

- `app/src/mobile/mobile-app.tsx`
  - `MobileMessageList`: virtualizer, bottom-lock tracking, settling, fallback window, jump control, hidden-message filtering.
  - `MobileMessage`: message-local pending semantics for tool cards.
- `app/src/mobile/mobile-app.test.tsx`
  - 500-message DOM-bound regression.
  - reader-scroll and jump-to-latest regression.
  - hidden-message regression.
  - historical-versus-pending tool-state regression.
- `MOBILE-PLAN.md`
  - P4.8 completion and remaining P4 scope.

## Known follow-up optimization

`MobileApp` still subscribes directly to `$messages`, so each streaming publish rerenders the shell before React reaches the bounded virtual rows. Virtualization prevents unbounded DOM/layout cost, which is the primary long-session problem, but a later optimization can move the `$messages` subscription into an isolated/memoized transcript component so header, sheets, and composer do not rerender per token. Do this only with regression coverage for session identity, tool-sheet state, and submit/jump behavior.

## Exact next steps

1. **Physical-device acceptance on the Galaxy S26:** force-close/reopen the app, open a long conversation, scroll upward while a response streams, verify the viewport stays put, then tap **Latest** and verify it returns to the newest turn.
2. Recheck the previously shipped drawer: it should remain opaque and should not summon the keyboard until Search is tapped.
3. Complete the remaining P4 stress/polish slice:
   - 2,000-line diff fixture;
   - 10,000-line tool-output fixture;
   - hard output preview budget;
   - full-screen/show-all treatment without losing transcript position.
4. If device profiling still shows stream-time shell churn, extract and memoize the transcript subscription as described above.
