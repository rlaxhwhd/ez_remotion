import React, { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { VideoComposition } from "../remotion/VideoComposition";
import { useStore, selectedClip } from "../store";
import type { Rect } from "../types";

export const PreviewPanel: React.FC<{ playerRef: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const pendingRegion = useStore((s) => s.pendingRegion);
  const setPendingRegion = useStore((s) => s.setPendingRegion);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);
  const setPlaying = useStore((s) => s.setPlaying);
  const selClip = useStore(selectedClip);
  const updateClip = useStore((s) => s.updateClip);

  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isPlayingRef = useRef(false);
  const [stageSize, setStageSize] = useState({ w: 640, h: 360 });
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [moveDrag, setMoveDrag] = useState<{ x0: number; y0: number; origX: number; origY: number } | null>(null);
  // resize drag: stores stage-local start coords + original scale + clip center
  const [resizeDrag, setResizeDrag] = useState<{
    x0: number; y0: number; origScale: number; cx: number; cy: number;
  } | null>(null);

  // fit the stage into the available area, preserving the composition aspect ratio
  useEffect(() => {
    const fit = () => {
      const el = wrapRef.current;
      if (!el) return;
      const pad = 32;
      const availW = el.clientWidth - pad;
      const availH = el.clientHeight - pad;
      const aspect = project.width / project.height;
      let w = availW;
      let h = w / aspect;
      if (h > availH) {
        h = availH;
        w = h * aspect;
      }
      setStageSize({ w: Math.max(80, w), h: Math.max(80, h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  // keep store's currentFrame and play-state in sync with the player
  useEffect(() => {
    const ref = playerRef.current;
    if (!ref) return;
    let lastStoreUpdate = 0;
    const onFrame = (e: { detail: { frame: number } }) => {
      const f = e.detail.frame;
      if (!isPlayingRef.current) {
        setCurrentFrame(f);
        return;
      }
      // During playback, move the timeline playhead by writing its left directly (cheap)
      // every frame, and only update the store a couple of times a second. Re-rendering
      // the (heavy) timeline on every frame steals main-thread time from the player, which
      // slows its clock so the video races ahead and gets yanked back — the stutter.
      // 110 mirrors Timeline's LABEL_W; store currentFrame is reconciled on pause.
      const ph = document.querySelector<HTMLElement>(".playhead");
      if (ph) ph.style.left = `${110 + f * useStore.getState().pixelsPerFrame}px`;
      const now = performance.now();
      if (now - lastStoreUpdate >= 500) {
        lastStoreUpdate = now;
        setCurrentFrame(f);
      }
    };
    const onPlay = () => { isPlayingRef.current = true; setPlaying(true); };
    const onPause = () => {
      isPlayingRef.current = false;
      setPlaying(false);
      // The throttle above lets currentFrame lag the player by up to 2 frames during
      // playback. Snap it to the exact displayed frame on pause so the timeline
      // playhead matches the preview and edits land on the frame the user sees.
      // (Pausing flips `playing` to false → the video's tight tolerance re-renders it
      // onto the exact frame. No seekTo here — that would fight rapid play/pause.)
      setCurrentFrame(ref.getCurrentFrame());
    };
    if (import.meta.env.DEV) (window as unknown as { __player?: PlayerRef }).__player = ref;
    ref.addEventListener("frameupdate", onFrame);
    ref.addEventListener("play", onPlay);
    ref.addEventListener("pause", onPause);
    return () => {
      ref.removeEventListener("frameupdate", onFrame);
      ref.removeEventListener("play", onPlay);
      ref.removeEventListener("pause", onPause);
    };
  }, [playerRef, setCurrentFrame, setPlaying]);

  const normRect = (d: { x0: number; y0: number; x1: number; y1: number }, el: DOMRect): Rect => {
    const x = (Math.min(d.x0, d.x1) - el.left) / el.width;
    const y = (Math.min(d.y0, d.y1) - el.top) / el.height;
    const w = Math.abs(d.x1 - d.x0) / el.width;
    const h = Math.abs(d.y1 - d.y0) / el.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
      width: Math.max(0, Math.min(1, w)),
      height: Math.max(0, Math.min(1, h)),
    };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool !== "region") return;
    setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x1: e.clientX, y1: e.clientY });
  };
  const onMouseUp = () => {
    if (!drag || !stageRef.current) return setDrag(null);
    const rect = normRect(drag, stageRef.current.getBoundingClientRect());
    if (rect.width > 0.01 && rect.height > 0.01) setPendingRegion(rect);
    setDrag(null);
  };

  // Clip bounding box in stage-local pixels (used for bbox outline + resize handles).
  // For image/video, uses objectFit:"contain" math so the box matches the actual
  // rendered content (not the full AbsoluteFill/composition size).
  const clipBounds = (() => {
    if (!selClip || selClip.kind === "audio" || tool !== "select") return null;
    const stageScale = stageSize.w / project.width; // composition → stage ratio

    // Actual content size in composition pixels (before transform.scale)
    let contentW = project.width;
    let contentH = project.height;
    if (selClip.kind === "image" || selClip.kind === "video") {
      const imgAspect = selClip.naturalWidth / selClip.naturalHeight;
      const compAspect = project.width / project.height;
      if (imgAspect >= compAspect) {
        contentW = project.width;
        contentH = project.width / imgAspect;
      } else {
        contentH = project.height;
        contentW = project.height * imgAspect;
      }
    } else if (selClip.kind === "shape") {
      contentW = selClip.width;
      contentH = selClip.height;
    }

    const cx = stageSize.w / 2 + selClip.transform.x * stageScale;
    const cy = stageSize.h / 2 + selClip.transform.y * stageScale;
    const hw = (contentW * stageScale * selClip.transform.scale) / 2;
    const hh = (contentH * stageScale * selClip.transform.scale) / 2;
    return { cx, cy, left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh, w: hw * 2, h: hh * 2 };
  })();

  // ── drag-to-move the selected clip in the preview (select tool) ────────────
  const onMoveDown = (e: React.MouseEvent) => {
    if (!selClip || selClip.kind === "audio") return;
    setMoveDrag({ x0: e.clientX, y0: e.clientY, origX: selClip.transform.x, origY: selClip.transform.y });
  };
  const onMoveMove = (e: React.MouseEvent) => {
    if (!moveDrag || !selClip) return;
    const sx = project.width / stageSize.w;
    const sy = project.height / stageSize.h;
    updateClip(selClip.id, {
      transform: {
        ...selClip.transform,
        x: Math.round(moveDrag.origX + (e.clientX - moveDrag.x0) * sx),
        y: Math.round(moveDrag.origY + (e.clientY - moveDrag.y0) * sy),
      },
    });
  };

  // ── resize via corner handles ─────────────────────────────────────────────
  const onResizeDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selClip || !clipBounds || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setResizeDrag({
      x0: e.clientX - rect.left,
      y0: e.clientY - rect.top,
      origScale: selClip.transform.scale,
      cx: clipBounds.cx,
      cy: clipBounds.cy,
    });
  };

  // Combined overlay handlers — resize takes priority over move
  const onOverlayMove = (e: React.MouseEvent) => {
    if (resizeDrag && selClip && stageRef.current) {
      const rect = stageRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dist0 = Math.hypot(resizeDrag.x0 - resizeDrag.cx, resizeDrag.y0 - resizeDrag.cy);
      const dist1 = Math.hypot(mx - resizeDrag.cx, my - resizeDrag.cy);
      if (dist0 > 1) {
        const newScale = Math.max(0.05, Math.min(5, resizeDrag.origScale * (dist1 / dist0)));
        updateClip(selClip.id, { transform: { ...selClip.transform, scale: +newScale.toFixed(2) } });
      }
      return;
    }
    onMoveMove(e);
  };

  const onOverlayUp = () => {
    setResizeDrag(null);
    setMoveDrag(null);
  };

  // visual rect for pending region or active drag
  const liveRect =
    drag && stageRef.current
      ? (() => {
          const el = stageRef.current.getBoundingClientRect();
          return {
            left: Math.min(drag.x0, drag.x1) - el.left,
            top: Math.min(drag.y0, drag.y1) - el.top,
            width: Math.abs(drag.x1 - drag.x0),
            height: Math.abs(drag.y1 - drag.y0),
          };
        })()
      : pendingRegion
        ? {
            left: pendingRegion.x * stageSize.w,
            top: pendingRegion.y * stageSize.h,
            width: pendingRegion.width * stageSize.w,
            height: pendingRegion.height * stageSize.h,
          }
        : null;

  return (
    <div className="preview-wrap" ref={wrapRef}>
      <div ref={stageRef} className="player-stage" style={{ width: stageSize.w, height: stageSize.h }}>
        <Player
          ref={playerRef}
          component={VideoComposition}
          inputProps={{ project }}
          durationInFrames={Math.max(1, project.durationInFrames)}
          compositionWidth={project.width}
          compositionHeight={project.height}
          fps={project.fps}
          style={{ width: "100%", height: "100%" }}
          acknowledgeRemotionLicense
          overflowVisible
        />
        {tool === "region" && (
          <div
            className="selection-overlay"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {liveRect && (
              <div
                className="selection-rect"
                style={{ left: liveRect.left, top: liveRect.top, width: liveRect.width, height: liveRect.height }}
              />
            )}
          </div>
        )}
        {/* Bounding box + resize handles for selected clip */}
        {clipBounds && (
          <>
            <div
              className="clip-bbox"
              style={{ left: clipBounds.left, top: clipBounds.top, width: clipBounds.w, height: clipBounds.h }}
            />
            {([
              [clipBounds.left, clipBounds.top, "nw-resize"],
              [clipBounds.right, clipBounds.top, "ne-resize"],
              [clipBounds.right, clipBounds.bottom, "se-resize"],
              [clipBounds.left, clipBounds.bottom, "sw-resize"],
            ] as [number, number, string][]).map(([x, y, cursor], i) => (
              <div
                key={i}
                className="resize-handle"
                style={{ left: x - 5, top: y - 5, cursor }}
                onMouseDown={onResizeDown}
              />
            ))}
          </>
        )}
        {tool === "select" && selClip && selClip.kind !== "audio" && (
          <div
            className="move-overlay"
            style={{ cursor: resizeDrag ? "crosshair" : moveDrag ? "grabbing" : "grab" }}
            onMouseDown={onMoveDown}
            onMouseMove={onOverlayMove}
            onMouseUp={onOverlayUp}
            onMouseLeave={onOverlayUp}
          />
        )}
      </div>
    </div>
  );
};
