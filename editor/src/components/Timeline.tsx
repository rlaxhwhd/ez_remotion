import React, { useRef } from "react";
import type { PlayerRef } from "@remotion/player";
import { useStore } from "../store";
import type { Clip, VideoClip, AudioClip } from "../types";

const LABEL_W = 110;

const clipColor = (kind: Clip["kind"]): string => {
  switch (kind) {
    case "video":
      return "#2d6cdf";
    case "image":
      return "#7c54d6";
    case "text":
      return "#1f9e6b";
    case "shape":
      return "#c2701c";
    case "audio":
      return "#0e7c86";
  }
};

export const Timeline: React.FC<{ playerRef: React.RefObject<PlayerRef | null> }> = ({ playerRef }) => {
  const project = useStore((s) => s.project);
  const ppf = useStore((s) => s.pixelsPerFrame);
  const setPpf = useStore((s) => s.setPixelsPerFrame);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const selectClip = useStore((s) => s.selectClip);
  const moveClipStart = useStore((s) => s.moveClipStart);
  const resizeClip = useStore((s) => s.resizeClip);
  const currentFrame = useStore((s) => s.currentFrame);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);

  const bodyRef = useRef<HTMLDivElement>(null);

  const totalFrames = Math.max(project.durationInFrames + project.fps * 2, project.fps * 5);
  const contentWidth = LABEL_W + totalFrames * ppf;

  const seek = (frame: number) => {
    const f = Math.max(0, Math.round(frame));
    setCurrentFrame(f);
    playerRef.current?.seekTo(f);
  };

  const onRulerClick = (e: React.MouseEvent) => {
    const el = bodyRef.current;
    if (!el) return;
    const x = e.clientX - el.getBoundingClientRect().left + el.scrollLeft - LABEL_W;
    seek(x / ppf);
  };

  // drag move / resize
  const startDrag = (
    e: React.MouseEvent,
    clip: Clip,
    mode: "move" | "left" | "right",
  ) => {
    e.stopPropagation();
    selectClip(clip.id);
    const startX = e.clientX;
    const origStart = clip.start;
    const origDur = clip.duration;
    const origTrim = clip.kind === "video" || clip.kind === "audio" ? (clip as VideoClip | AudioClip).trimStart : 0;
    const natural =
      clip.kind === "video" || clip.kind === "audio" ? (clip as VideoClip | AudioClip).naturalDurationInFrames : Infinity;

    const onMove = (me: MouseEvent) => {
      const df = Math.round((me.clientX - startX) / ppf);
      if (mode === "move") {
        moveClipStart(clip.id, origStart + df);
      } else if (mode === "right") {
        let newDur = Math.max(1, origDur + df);
        if (isFinite(natural)) newDur = Math.min(newDur, natural - origTrim);
        resizeClip(clip.id, "end", origStart, newDur);
      } else {
        // left edge
        let newStart = origStart + df;
        let delta = newStart - origStart;
        // clamp so trim stays >= 0 and duration >= 1
        if (origTrim + delta < 0) delta = -origTrim;
        if (origDur - delta < 1) delta = origDur - 1;
        newStart = origStart + delta;
        resizeClip(clip.id, "start", newStart, origDur - delta, origTrim + delta);
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ruler ticks every second
  const ticks: React.ReactNode[] = [];
  const totalSeconds = Math.ceil(totalFrames / project.fps);
  for (let s = 0; s <= totalSeconds; s++) {
    ticks.push(
      <div key={s} className="ruler-tick" style={{ left: LABEL_W + s * project.fps * ppf }}>
        {s}s
      </div>,
    );
  }

  const playheadX = LABEL_W + currentFrame * ppf;

  return (
    <div className="timeline">
      <div className="timeline-head">
        <strong style={{ fontSize: 12 }}>타임라인</strong>
        <span className="muted">컷편집: 클립 선택 후 상단 ✂ 분할 / Del 삭제</span>
        <div style={{ flex: 1 }} />
        <span className="muted">줌</span>
        <input
          type="range"
          min={0.5}
          max={20}
          step={0.1}
          value={ppf}
          onChange={(e) => setPpf(Number(e.target.value))}
          style={{ width: 120 }}
        />
      </div>
      <div className="timeline-body" ref={bodyRef}>
        <div style={{ width: contentWidth, position: "relative" }}>
          <div className="ruler" onClick={onRulerClick} style={{ width: contentWidth }}>
            {ticks}
          </div>

          {project.tracks.map((track) => (
            <div key={track.id} className="track-row">
              <div className="track-label">{track.name}</div>
              {project.clips
                .filter((c) => c.trackId === track.id)
                .map((clip) => (
                  <div
                    key={clip.id}
                    className={"clip" + (clip.id === selectedClipId ? " selected" : "")}
                    style={{
                      left: LABEL_W + clip.start * ppf,
                      width: Math.max(8, clip.duration * ppf),
                      background: clipColor(clip.kind),
                    }}
                    onMouseDown={(e) => startDrag(e, clip, "move")}
                    title={clip.name}
                  >
                    <div className="handle l" onMouseDown={(e) => startDrag(e, clip, "left")} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{clip.name}</span>
                    <div className="handle r" onMouseDown={(e) => startDrag(e, clip, "right")} />
                  </div>
                ))}
            </div>
          ))}

          <div
            className="playhead"
            style={{ left: playheadX, height: 22 + project.tracks.length * 56 }}
          />
        </div>
      </div>
    </div>
  );
};
