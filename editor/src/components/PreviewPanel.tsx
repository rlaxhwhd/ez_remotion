import React, { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { VideoComposition } from "../remotion/VideoComposition";
import { useStore } from "../store";
import type { Rect } from "../types";

export const PreviewPanel: React.FC<{ playerRef: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const project = useStore((s) => s.project);
  const tool = useStore((s) => s.tool);
  const pendingRegion = useStore((s) => s.pendingRegion);
  const setPendingRegion = useStore((s) => s.setPendingRegion);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);
  const setPlaying = useStore((s) => s.setPlaying);

  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 640, h: 360 });
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

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
    const onFrame = (e: { detail: { frame: number } }) => setCurrentFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
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
      </div>
    </div>
  );
};
