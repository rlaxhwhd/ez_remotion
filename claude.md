# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project: remotion-web-editor (this repo)

Custom browser video editor built on Remotion. **Vite + React 19 + zustand.** The dynamic Remotion composition renders directly from the editor's serialized project state. This is the user's main hands-on editor (timeline, area-zoom, effect clips, crop, split) — not the designcombo editor that lives in the sibling `changwon_video/editor`.

## Run / verify
- `cd editor && pnpm dev` → **http://localhost:5273** (Vite HMR). Editing `store.ts` may need a full page refresh (F5); the project auto-persists to localStorage and reloads.
- Typecheck: `cd editor && node node_modules/typescript/bin/tsc -b` (or `pnpm build`).
- Export mp4: `pnpm server` (local render server) then the ⬇ 내보내기 button; `pnpm dev:all` runs both.
- Quick logic checks: the dev store is exposed as **`window.__editorStore`** (e.g. `__editorStore.getState().mergeClips([...])`).
- Remotion rules live in `.claude/skills/remotion-best-practices` (animate with `useCurrentFrame()`/`interpolate` only; never `useFrame`; assets via `staticFile()`).

## Architecture (editor/src)
- **`types.ts`** — data model. A `Project` has `clips[]` + `tracks[]`. Each `Clip` (video/image/text/shape/audio) has `start`/`duration` (timeline frames), a `transform`, and two overlay lists:
  - `animations: AnimationInstance[]` — entrance/emphasis/exit motion (keys into `remotion/animations.ts`).
  - `effects: EffectInstance[]` — visual effects (keys into `remotion/effects.ts`); region effects carry a normalized `region` Rect.
  - Both overlays have OPTIONAL `start`/`duration` (absolute timeline frames) so they're timed independently of the clip → these are the **"effect clips" / mini-bars** shown under each clip on the timeline.
- **`store.ts`** — zustand store: all state + actions. `selectedClipId` = primary (drives the Inspector), `selectedClipIds` = full multi-selection. Undo history + localStorage persistence via subscriptions.
- **`components/Timeline.tsx`** — DOM timeline (no canvas). One row per track; clip bar on top, overlay "subclip" bars beneath (each draggable/resizable). `setOverlayTiming` clamps an overlay to its parent clip's range.
- **`components/Inspector.tsx`** — right panel: clip props, transform, transition, animations (In/Emphasis/Out), region-selection effect tool, filter effects.
- **`components/PreviewPanel.tsx` + `remotion/VideoComposition.tsx` + `remotion/ClipRenderer.tsx`** — the live Remotion `<Player>` and the composition; `ClipRenderer` applies each clip's transform + its active animations/effects.
- **`remotion/animations.ts`** — animation registry. `zoomPush` = area zoom-IN (scale 1→to, translate 0→toX/toY, then holds). `zoomPop` = matching zoom-OUT.
- **`remotion/effects.ts`** — `filterEffectRegistry` (full-frame @remotion/effects: blur, glow…) + `regionEffectRegistry` (CSS-masked rect overlays: 영역 블러, **강조 박스=`highlight`**, spotlight, … and `zoomToRegion` reframe).
- **`lib/regionCommand.ts`** — maps Korean/English text ("줌", "블러", "강조"…) to a region-effect type.

## Key behaviors / gotchas
- **Area zoom-in is an animation, not the `zoomToRegion` effect.** Inspector's `applyRegion("zoomToRegion")` splits the clip at the playhead and adds a **`zoomPush`** animation to the right half. (`zoomToRegion` exists in the registry but the UI routes zoom through `zoomPush`.)
- **Effects/animations only render while their parent clip is on screen** (`ClipRenderer` `active()` uses `absFrame = clip.start + frame`). An overlay bar can't apply across two separate clips — merge the clips first.
- New clips each get their own track (`spawnTrack`), newest on top.

## Session additions (2026-06-30)
- **#1 Ctrl/⌘ multi-select + group move** — `store.ts` (`selectedClipIds`, `selectClip(id, additive)`), `Timeline.tsx` (ctrl-click toggles; dragging a selected clip moves the whole group; all highlighted), `App.tsx` (Del / 🗑 act on the whole selection).
- **#6 Merge / un-split** — `store.ts` `mergeClips(ids)` (same-track only; keeps leftmost, extends duration to cover all, unions+dedupes every piece's overlays) + `App.tsx` **🔗 합치기** button (enabled when ≥2 clips selected).
- **#5 Effect bar across split clips** — solved by #6: after merging two halves into one clip, the effect bar drags across the full merged range. The parent-clip clamp in `setOverlayTiming` was intentionally kept (an effect can't render where its clip isn't).
- **#4 Matching zoom-out** — `animations.ts` `zoomPop` (mirror of zoomPush); `store.ts` `addMatchingZoomOut(clipId)` (reads the clip's `zoomPush` to/toX/toY, places a `zoomPop` at the clip tail, trims the zoom-in's hold so they don't double-stack); `Inspector.tsx` **"영역 줌 아웃 → ↩ 같은 영역으로 줌아웃 추가"** button (shown when the clip has a zoomPush).
- Verified: `tsc -b` clean; runtime tests via `window.__editorStore` (multi-select, merge preserves effects, zoom-out matches strength and tiles cleanly at the tail).

## Deferred / open
- **#2 Entrance (In) animation default length** — In animations animate over their own `duration` (sec) param, independent of clip length; revisit if a shorter default is wanted.
- **#3 "색상 강조박스"** — already exists as the `highlight` region effect (영역 선택 도구 → 강조 박스). Confirm it meets the need before building anything new.