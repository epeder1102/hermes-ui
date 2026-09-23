# Mobile UI Stabilization Progress

Last updated: 2026-09-23

## Repository and deployment state

- Host: `devbox`
- Repository: `/home/eric/projects/hermes-ui`
- Branch: `feat/mobile-p4-chat-surface`
- Long-session transcript: `d162502` (`feat(mobile): virtualize long conversations`)
- Transcript semantics fix: `b4d79a3` (`fix(mobile): preserve transcript message semantics`)
- Large-output readers: `f66bd00` (`feat(mobile): bound large output readers`)
- Current live asset: `index-CeNnvhhv.js`
- Live asset SHA-256: `5361bed7d9f8e21f8862634a76a94cf6d3c555f2ff127ae1e0ed67328c84fd8c`
- Current rollback backup: `/opt/hermes-ui/dist.backup-20260923-173506`

## Completed slice: P4.8 long-session transcript

- [x] Replace the unbounded `messages.map` transcript with `@tanstack/react-virtual` variable-height virtualization.
- [x] Keep the mobile DOM bounded for a 500-message transcript (fewer than 40 rows in the regression fixture).
- [x] Measure rich/variable-height message rows and retain overscan for smooth phone scrolling.
- [x] Open initial history and switched sessions at the newest message.
- [x] Follow streaming growth only while the reader remains near the bottom.
- [x] Release bottom lock when the reader scrolls into history so streaming cannot yank the viewport.
- [x] Add a 44px accessible `Jump to latest message` control that restores bottom lock.
- [x] Avoid smooth-scroll races while row heights are changing.
- [x] Filter hidden records before virtual indexing/rendering.
- [x] Derive running tool state from the owning message's `pending` state instead of global session `busy`.

## Completed slice: P4.9 large-output readers

- [x] Keep terminal/tool output previews to the newest 200 lines.
- [x] Keep fenced-code previews to the first 120 lines.
- [x] Keep expanded diff hunks to at most 160 styled line rows.
- [x] Open complete output, code, and raw diffs in a viewport-sized full-screen reader rather than expanding a virtual transcript row.
- [x] Render each complete payload as one text node, avoiding 2,000–10,000 per-line DOM elements.
- [x] Preserve the underlying diff expansion, tool sheet, and transcript state when the reader closes.
- [x] Keep streaming output pinned only while the reader remains at the end; expose `Jump to end` after scrolling away.
- [x] Provide full-payload copy, line counts, Escape handling, safe-area padding, and 44px actions.
- [x] Portal tool sheets and full-screen readers to `document.body`, avoiding transformed virtual-row containing-block bugs.
- [x] Ensure Escape closes only the topmost full-screen reader, not its underlying tool sheet.
- [x] Add explicit 10,000-line tool-output, 2,000-line diff, and 500-line fenced-code stress regressions.
- [x] Update `MOBILE-PLAN.md` to mark P4.9 complete.
- [x] Build, push, deploy atomically, and verify the live production asset.

## Validation evidence

- Focused P4.8/P4.9 suites: **33/33 passed**:
  - `src/mobile/mobile-app.test.tsx`: 16 tests;
  - `src/mobile/diff-model.test.ts`: 14 tests;
  - `src/mobile/large-output.test.tsx`: 3 tests.
- Stress assertions prove:
  - a 10,000-line tool preview contains only its bounded tail while full screen exposes both endpoints with fewer than 20 reader descendants;
  - a 2,000-line expanded diff hunk mounts exactly 160 styled line rows while full screen exposes the final lines;
  - closing full screen restores the bounded underlying renderer without losing expansion state.
- TypeScript: passed (`npx tsc -p . --noEmit`).
- ESLint: passed for all modified implementation and test files with no warnings.
- Production Vite/PWA build: passed; generated `index-CeNnvhhv.js`.
- Full local jsdom suite: **1,360 passed / 1,365 total**. The five failures are the same known repository baseline failures outside this slice:
  - three gateway connecting-overlay tests lacking their expected routing/state conditions;
  - one pane width-override expectation;
  - one prompt recovery expectation that omits the newer `source` field.
- Android CI for `f66bd00`: passed on attempt 2 — <https://github.com/epeder1102/hermes-ui/actions/runs/35928842611>. Attempt 1 hit the unrelated flaky `toolset-config-panel` credential test; the rerun passed test, web build, Capacitor sync, APK build, and artifact upload.
- Atomic deployment completed with the previous production directory retained at `/opt/hermes-ui/dist.backup-20260923-173506`.
- Direct live fetch of `/assets/index-CeNnvhhv.js` returned HTTP 200, matched the deployed file byte-for-byte, and contained the large-output/full-screen plus transcript markers.
- Authenticated `/api/status` returned HTTP 200 JSON.
- `hermes-dashboard.service` remained active after the swap.

## P4.9 files

- `app/src/mobile/text-budget.ts`
  - allocation-light line counting and bounded head/tail extraction.
- `app/src/mobile/fullscreen-text.tsx`
  - portal-based complete-payload reader with focus restoration, copy, safe areas, and streaming tail-follow behavior.
- `app/src/mobile/tool-sheet.tsx`
  - 200-line tail previews, full-screen output, and body-level portal rendering.
- `app/src/mobile/code-block.tsx`
  - 120-line head previews and full-screen code.
- `app/src/mobile/diff-view.tsx`
  - 160-row hunk previews and complete raw-diff full screen.
- `app/src/mobile/large-output.test.tsx`
  - 10,000-line output, 2,000-line diff, and long-code stress coverage.
- `MOBILE-PLAN.md`
  - P4.9 completion and remaining physical-device acceptance.

## Known follow-up optimization

`MobileApp` still subscribes directly to `$messages`, so each streaming publish rerenders the shell before React reaches the bounded virtual rows. Virtualization and output budgets prevent unbounded DOM/layout cost, which is the primary long-session problem, but a later optimization can move the `$messages` subscription into an isolated/memoized transcript component so header, sheets, and composer do not rerender per token. Do this only with regression coverage for session identity, tool-sheet state, and submit/jump behavior.

## Exact next steps

1. **Physical-device acceptance on the Galaxy S26:**
   - force-close/reopen the app;
   - open a long conversation and verify history scrolling plus **Latest**;
   - open a large tool result and a large diff, use **Show all** / **Full screen**, then close and verify the sheet/transcript position is unchanged;
   - rotate while full screen and confirm horizontal scrolling remains usable for no-wrap output.
2. Recheck the previously shipped drawer: it should remain opaque and should not summon the keyboard until Search is tapped.
3. If device profiling still shows stream-time shell churn, extract and memoize the transcript subscription as described above.
4. After physical acceptance, close P4 and begin P5 shell/peripheral cleanup.
