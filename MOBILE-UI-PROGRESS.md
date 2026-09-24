# Mobile UI Stabilization Progress

Last updated: 2026-09-23

## Repository and deployment state

- Host: `devbox`
- Repository: `/home/eric/projects/hermes-ui`
- Branch: `feat/mobile-p4-chat-surface`
- Long-session transcript: `d162502` (`feat(mobile): virtualize long conversations`)
- Transcript semantics fix: `b4d79a3` (`fix(mobile): preserve transcript message semantics`)
- Large-output readers: `f66bd00` (`feat(mobile): bound large output readers`)
- Large-output hardening: `9c67653` (`fix(mobile): harden large output overlays`)
- Review follow-up: `e3f35d3` (`fix(mobile): close overlay hardening gaps`)
- Live-activity UX follow-up: `32c5004` (`fix(mobile): simplify live agent activity`)
- Current live asset: `index-j4XB1vtk.js`
- Live index SHA-256: `573ef6112a7ebff5b627b0ec38578ccbdc72f1ef72cb22af1397fcea5461be03`
- Live asset SHA-256: `897f612e2adc96bf910f737c0fcc97f1ae3afddca4280a8638c6cba10ee2a77f`
- Current rollback backup: `/opt/hermes-ui/dist.rollback-32c5004-20260923-234145`

## Completed slice: P4.8 long-session transcript

- [x] Replace the unbounded `messages.map` transcript with `@tanstack/react-virtual` variable-height virtualization.
- [x] Keep the mobile DOM bounded for a 500-message transcript (fewer than 40 rows in the regression fixture).
- [x] Measure rich/variable-height message rows and retain overscan for smooth phone scrolling.
- [x] Open initial history and switched sessions at the newest message.
- [x] Follow streaming growth only while the reader remains near the bottom.
- [x] Release bottom lock when the reader scrolls into history so streaming cannot yank the viewport.
- [x] Add a 44px accessible `Jump to latest message` control that restores bottom lock.
- [x] Keep automatic stream-follow immediate to avoid dynamic-row smooth-scroll races; animate only the reader's explicit **Latest** action.
- [x] Filter hidden records before virtual indexing/rendering.
- [x] Derive running tool state from the owning message's `pending` state instead of global session `busy`.

## Completed slice: P4.9 large-output readers

- [x] Keep terminal/tool output previews to the newest 200 lines.
- [x] Keep fenced-code previews to the first 120 lines.
- [x] Keep expanded diff hunks to at most 160 styled line rows.
- [x] Open complete output, code, and raw diffs in a viewport-sized full-screen reader rather than expanding a virtual transcript row.
- [x] Virtualize complete payloads so fewer than 80 line rows mount, while per-line and preview character budgets also bound retained/rendered text.
- [x] Preserve the underlying diff expansion, tool sheet, and transcript state when the reader closes.
- [x] Keep streaming output pinned only while the reader remains at the end; expose `Jump to end` after scrolling away.
- [x] Provide full-payload copy, line counts, Escape handling, safe-area padding, and 44px actions.
- [x] Portal tool sheets and full-screen readers to `document.body`, avoiding transformed virtual-row containing-block bugs.
- [x] Ensure Escape closes only the topmost full-screen reader, not its underlying tool sheet.
- [x] Add explicit 10,000-line tool-output, 2,000-line diff, and 500-line fenced-code stress regressions.
- [x] Bound aggregate many-hunk previews and pathological single-line/minified diffs by both rows and characters.
- [x] Avoid constructing and retaining a duplicate merged terminal payload when split stdout/stderr streams are available.
- [x] Trap and restore focus, isolate modal backgrounds with reference counting, and preserve approval-sheet ownership when overlays unmount out of order.
- [x] Keep blocking approval above informational readers, recover focus during permanent-choice confirmation, and restore the prior trigger on close.
- [x] Update `MOBILE-PLAN.md` to mark P4.9 complete.
- [x] Build, push, deploy atomically, and verify the live production asset.

## Completed slice: P4.10 live-agent activity polish

- [x] Animate the explicit **Latest** action while keeping automatic stream-follow immediate and stable.
- [x] Show only the latest text/tool activity while an assistant turn is pending, replacing the prior activity as work advances.
- [x] Hide completed narration, reasoning, and tool history after turn completion while retaining the canonical final response.
- [x] Preserve all underlying transcript/tool data; the reduction is mobile presentation only.
- [x] Wrap long tool titles, commands, targets, URLs, and ordinary message text inside their containers.
- [x] Allow a direct transcript touch to interrupt an in-progress Latest animation.

## Validation evidence

- Focused hardening suites: **45/45 passed**:
  - terminal fallback model: 27 tests;
  - approval sheet and overlay ordering/isolation: 9 tests;
  - large-output stress and character budgets: 6 tests;
  - shared text-budget helpers: 3 tests.
- Stress assertions prove:
  - a 10,000-line tool preview retains a bounded tail while the complete reader mounts fewer than 80 virtual rows;
  - a 2,000-line expanded diff mounts exactly 160 styled rows while the complete raw diff remains available full screen;
  - a 128 KiB minified diff line is visually character-bounded without changing full-copy content;
  - 100 hunks are globally bounded to 40 controls;
  - nested reader/approval isolation survives out-of-order teardown without exposing or permanently hiding the app.
- TypeScript: passed (`npx tsc -p . --noEmit`).
- Strict ESLint: passed for `src/` with no warnings.
- Repository-defined CI-equivalent jsdom suite: passed with the three documented baseline files excluded by name.
- Full unrestricted local jsdom suite: **1,370 passed / 1,375 total**. The five failures remain exactly the known repository baseline failures:
  - three gateway connecting-overlay tests;
  - one pane width-override expectation;
  - one prompt recovery expectation.
- Production Vite/PWA build: passed; generated `index-CG2o-KQK.js`.
- `git diff --check`: passed.
- Independent review findings were resolved before release: reference-counted modal isolation, per-line diff character limits, and approval focus lifecycle handling.
- Android CI for `e3f35d3`: passed in 2m48s — <https://github.com/epeder1102/hermes-ui/actions/runs/35949539031>. Typecheck, lint, tests, web build, Capacitor generation/sync, APK build, and artifact upload all passed.
- The staged bundle contained 1,009 files; its complete manifest hash matched the devbox build: `b4a5e537232872af743ff28845ad1a8d04ba88fb2bb1a259be34bbc869581ba3`.
- Atomic `RENAME_EXCHANGE` deployment completed with the previous production directory retained at `/opt/hermes-ui/dist.rollback-e3f35d3-20260923-225241`.
- The deployed index and full manifest match the staged build. Direct live fetch of `/assets/index-CG2o-KQK.js` returned HTTP 200, byte-matched the deployed file, and contained the new truncation marker.
- `/api/status` returned HTTP 200 and `hermes-dashboard.service` remained active after the swap.
- Server deployment is verified; physical-device cache refresh and interaction acceptance remain outstanding.
- Live-activity focused regression suite: **16/16 passed**, including smooth Latest behavior, replaceable pending activity, final-answer-only completion, and text wrapping.
- Follow-up CI-equivalent jsdom suite: **1,316/1,316 passed** across 498 suites; unrestricted result remained **1,370/1,375** with the same five documented baseline failures.
- Follow-up production Vite/PWA build passed and generated `index-j4XB1vtk.js`; TypeScript, strict ESLint, and `git diff --check` also passed.
- Android CI for `32c5004`: passed in 3m26s — <https://github.com/epeder1102/hermes-ui/actions/runs/35956437557>. All tests, web build, Capacitor generation/sync, APK build, and artifact upload passed.
- The follow-up stage contained 1,009 files and exactly matched the devbox build manifest: `abee2ed5c3d13b42743119b68ddc8955132a801e41a97418566cffd4a87f7cb2`.
- Atomic `RENAME_EXCHANGE` deployment completed; live index/full manifest and the directly served `index-j4XB1vtk.js` bytes all match the validated stage.
- The prior `e3f35d3` production bundle is retained at `/opt/hermes-ui/dist.rollback-32c5004-20260923-234145`; `/api/status` remained HTTP 200 and `hermes-dashboard.service` remained active.

## P4.9/P4.10 files

- `app/src/mobile/text-budget.ts`
  - allocation-light line counting, bounded head/tail extraction, and shared visual-line character truncation.
- `app/src/mobile/fullscreen-text.tsx`
  - portal-based virtual complete-payload reader with focus trapping/restoration, copy, safe areas, and streaming tail-follow behavior.
- `app/src/mobile/modal-isolation.ts`
  - reference-counted body isolation that remains correct when nested overlays unmount out of order.
- `app/src/mobile/approval-sheet.tsx`
  - approval-safe overlay priority plus confirmation focus, containment, and trigger restoration.
- `app/src/mobile/tool-sheet.tsx`
  - 200-line tail previews, full-screen output, and body-level portal rendering.
- `app/src/mobile/code-block.tsx`
  - 120-line head previews and full-screen code.
- `app/src/mobile/diff-view.tsx`
  - 160-row hunk previews, aggregate many-hunk controls, per-line character limits, and complete raw-diff full screen.
- `app/src/mobile/large-output.test.tsx`
  - 10,000-line output, 2,000-line diff, many-hunk, pathological single-line, and long-code stress coverage.
- `app/src/mobile/approval-sheet.test.tsx`
  - blocking ownership, nested isolation, focus containment, and restoration regressions.
- `app/src/components/assistant-ui/tool/fallback-model/index.ts`
  - split-stream terminal modeling without duplicate merged-detail retention.
- `app/src/mobile/mobile-app.tsx`
  - virtual transcript bottom-lock behavior, animated explicit Latest action, replaceable current activity, final-answer-only completion, and bounded message wrapping.
- `app/src/mobile/tool-card.tsx`
  - wrapping, width-bounded current tool status cards with full output retained in the sheet.
- `app/src/mobile/mobile-app.test.tsx`
  - smooth Latest, current-activity replacement, final-answer cleanup, wrapping, virtualization, and profile-switching regressions.
- `MOBILE-PLAN.md`
  - P4.9 completion and remaining physical-device acceptance.

## Known follow-up optimization

`MobileApp` still subscribes directly to `$messages`, so each streaming publish rerenders the shell before React reaches the bounded virtual rows. Virtualization and output budgets prevent unbounded DOM/layout cost, which is the primary long-session problem, but a later optimization can move the `$messages` subscription into an isolated/memoized transcript component so header, sheets, and composer do not rerender per token. Do this only with regression coverage for session identity, tool-sheet state, and submit/jump behavior.

## Exact next steps

1. **Physical-device acceptance on the Galaxy S26:**
   - force-close/reopen the app;
   - open a long conversation and verify **Latest** visibly animates to the bottom;
   - start an agent turn with several tools and verify only the current activity is shown, it changes in place, and only the final answer remains when done;
   - verify a long command/path and a long unbroken message wrap inside their cards instead of extending past the bubble;
   - open a large tool result and a large diff, use **Show all** / **Full screen**, then close and verify the sheet/transcript position is unchanged;
   - open an approval above a full-screen reader, exercise **Always allow…** then **Back**, and verify focus and blocking behavior remain correct;
   - rotate while full screen and confirm horizontal scrolling remains usable for no-wrap output.
2. Recheck the previously shipped drawer: it should remain opaque and should not summon the keyboard until Search is tapped.
3. If device profiling still shows stream-time shell churn, extract and memoize the transcript subscription as described above.
4. After physical acceptance, close P4 and begin P5 shell/peripheral cleanup.
