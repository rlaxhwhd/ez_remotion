import React, { useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { useStore } from "../store";
import type { Clip, Track, VideoClip, AudioClip } from "../types";
import { animationRegistry } from "../remotion/animations";
import { filterEffectRegistry, regionEffectRegistry } from "../remotion/effects";

const LABEL_W = 110;
// Vertical layout of a track row: the clip on top, then one mini "sub-clip" bar
// per attached animation / effect stacked beneath it.
const ROW_TOP = 5;
const CLIP_H = 32;
const SUB_H = 26;
const SUB_GAP = 4;
const ROW_BOTTOM = 6;

type Badge = { id: string; label: string; cls: "anim" | "effect"; start: number; duration: number };
const clipBadges = (clip: Clip): Badge[] => [
  ...clip.animations.map((a) => ({
    id: a.id,
    label: animationRegistry[a.type]?.label ?? a.type,
    cls: "anim" as const,
    start: a.start ?? clip.start,
    duration: a.duration ?? clip.duration,
  })),
  ...clip.effects.map((e) => ({
    id: e.id,
    label: (filterEffectRegistry[e.type] ?? regionEffectRegistry[e.type] ?? animationRegistry[e.type])?.label ?? e.type,
    cls: "effect" as const,
    start: e.start ?? clip.start,
    duration: e.duration ?? clip.duration,
  })),
];

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
  const selectedClipIds = useStore((s) => s.selectedClipIds);
  const selectClip = useStore((s) => s.selectClip);
  const moveClipStart = useStore((s) => s.moveClipStart);
  const resizeClip = useStore((s) => s.resizeClip);
  const setOverlayTiming = useStore((s) => s.setOverlayTiming);
  const moveTrack = useStore((s) => s.moveTrack);
  const currentFrame = useStore((s) => s.currentFrame);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);

  const [timelineHeight, setTimelineHeight] = useState(220);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = timelineHeight;
    const onMove = (me: MouseEvent) => {
      const delta = startY - me.clientY;
      setTimelineHeight(Math.max(100, Math.min(600, startH + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const totalFrames = Math.max(project.durationInFrames + project.fps * 2, project.fps * 5);
  const contentWidth = LABEL_W + totalFrames * ppf;

  // A track row grows to fit the clip with the most attached animations/effects.
  const trackBadgeRows = (track: Track) => {
    const counts = project.clips.filter((c) => c.trackId === track.id).map((c) => clipBadges(c).length);
    return counts.length ? Math.max(...counts) : 0;
  };
  const trackHeight = (track: Track) => {
    const n = trackBadgeRows(track);
    return ROW_TOP + CLIP_H + ROW_BOTTOM + (n ? SUB_GAP + n * SUB_H : 0);
  };
  const tracksHeight = project.tracks.reduce((sum, t) => sum + trackHeight(t), 0);

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
    // Ctrl/⌘-click toggles the clip in/out of the multi-selection (no drag).
    if (mode === "move" && (e.ctrlKey || e.metaKey)) {
      selectClip(clip.id, true);
      return;
    }
    // Drag the whole group if this clip is part of a multi-selection; else select it alone.
    const currentIds = useStore.getState().selectedClipIds;
    const group = mode === "move" && currentIds.includes(clip.id) && currentIds.length > 1 ? currentIds : [clip.id];
    if (!currentIds.includes(clip.id)) selectClip(clip.id);

    const startX = e.clientX;
    const allClips = useStore.getState().project.clips;
    const origStarts = new Map(group.map((id) => [id, allClips.find((c) => c.id === id)?.start ?? 0]));
    const minOrig = Math.min(...origStarts.values());
    const origStart = clip.start;
    const origDur = clip.duration;
    const origTrim = clip.kind === "video" || clip.kind === "audio" ? (clip as VideoClip | AudioClip).trimStart : 0;
    const natural =
      clip.kind === "video" || clip.kind === "audio" ? (clip as VideoClip | AudioClip).naturalDurationInFrames : Infinity;
    // playbackRate stretches the timeline length: `duration` timeline frames consume
    // `duration * rate` source frames, so the max length is (source left) / rate.
    const rate = clip.kind === "video" ? (clip as VideoClip).playbackRate : 1;

    const onMove = (me: MouseEvent) => {
      let df = Math.round((me.clientX - startX) / ppf);
      if (mode === "move") {
        df = Math.max(df, -minOrig); // keep the group together (leftmost can't go below 0)
        for (const id of group) moveClipStart(id, (origStarts.get(id) ?? 0) + df);
      } else if (mode === "right") {
        let newDur = Math.max(1, origDur + df);
        if (isFinite(natural)) newDur = Math.min(newDur, Math.round((natural - origTrim) / rate));
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

  // drag move / resize an animation or effect bar — independent of its clip
  const startSubDrag = (e: React.MouseEvent, clip: Clip, badge: Badge, mode: "move" | "left" | "right") => {
    e.stopPropagation();
    selectClip(clip.id);
    setSelectedSubId(badge.id);
    const startX = e.clientX;
    const origStart = badge.start;
    const origDur = badge.duration;
    const onMove = (me: MouseEvent) => {
      const df = Math.round((me.clientX - startX) / ppf);
      if (mode === "move") setOverlayTiming(clip.id, badge.cls, badge.id, origStart + df, origDur);
      else if (mode === "right") setOverlayTiming(clip.id, badge.cls, badge.id, origStart, origDur + df);
      else setOverlayTiming(clip.id, badge.cls, badge.id, origStart + df, origDur - df);
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
    <div className="timeline" style={{ height: timelineHeight }}>
      <div className="timeline-resize-handle" onMouseDown={startResize} />
      <div className="timeline-head">
        <strong style={{ fontSize: 12 }}>타임라인</strong>
        <span className="muted">컷편집: ✂ 분할 / Del 삭제 · Ctrl(⌘)+클릭 다중선택 → 드래그로 함께 이동, 🔗 합치기</span>
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

          {project.tracks.map((track, tIdx) => (
            <div key={track.id} className="track-row" style={{ height: trackHeight(track) }}>
              <div className="track-label">
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{track.name}</span>
                <div className="track-order-btns">
                  <button
                    className="track-order-btn"
                    title="앞으로 (위 레이어)"
                    disabled={tIdx === 0}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); moveTrack(track.id, "up"); }}
                  >▲</button>
                  <button
                    className="track-order-btn"
                    title="뒤로 (아래 레이어)"
                    disabled={tIdx === project.tracks.length - 1}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); moveTrack(track.id, "down"); }}
                  >▼</button>
                </div>
              </div>
              {project.clips
                .filter((c) => c.trackId === track.id)
                .map((clip) => {
                  const left = LABEL_W + clip.start * ppf;
                  const width = Math.max(8, clip.duration * ppf);
                  return (
                    <React.Fragment key={clip.id}>
                      <div
                        className={"clip" + (selectedClipIds.includes(clip.id) ? " selected" : "")}
                        style={{ left, width, top: ROW_TOP, height: CLIP_H, background: clipColor(clip.kind) }}
                        onMouseDown={(e) => startDrag(e, clip, "move")}
                        title={clip.name}
                      >
                        <div className="handle l" onMouseDown={(e) => startDrag(e, clip, "left")} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{clip.name}</span>
                        <div className="handle r" onMouseDown={(e) => startDrag(e, clip, "right")} />
                      </div>
                      {clipBadges(clip).map((b, i) => (
                        <div
                          key={b.id}
                          className={"subclip " + b.cls + (selectedSubId === b.id ? " sub-selected" : "")}
                          style={{
                            left: LABEL_W + b.start * ppf,
                            width: Math.max(8, b.duration * ppf),
                            top: ROW_TOP + CLIP_H + SUB_GAP + i * SUB_H,
                            height: SUB_H - 2,
                          }}
                          title={`${b.label} — 드래그로 이동, 양 끝으로 길이 조절`}
                          onMouseDown={(e) => startSubDrag(e, clip, b, "move")}
                        >
                          <div className="handle l" onMouseDown={(e) => startSubDrag(e, clip, b, "left")} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>
                            {b.cls === "anim" ? "✨ " : "🎨 "}
                            {b.label}
                          </span>
                          <div className="handle r" onMouseDown={(e) => startSubDrag(e, clip, b, "right")} />
                        </div>
                      ))}
                    </React.Fragment>
                  );
                })}
            </div>
          ))}

          <div className="playhead" style={{ left: playheadX, height: 22 + tracksHeight }} />
        </div>
      </div>
    </div>
  );
};
