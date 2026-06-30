import React, { useEffect, useRef, useState } from "react";
import type { PlayerRef } from "@remotion/player";
import { MediaPanel } from "./components/MediaPanel";
import { PreviewPanel } from "./components/PreviewPanel";
import { Inspector } from "./components/Inspector";
import { Timeline } from "./components/Timeline";
import { useStore } from "./store";
import { loadProject } from "./lib/persist";
import { exportProject } from "./lib/exporter";

const fmt = (frame: number, fps: number) => {
  const totalSec = frame / fps;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  const f = Math.floor(frame % fps);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(f).padStart(2, "0")}`;
};

export const App: React.FC = () => {
  const playerRef = useRef<PlayerRef | null>(null);
  const project = useStore((s) => s.project);
  const currentFrame = useStore((s) => s.currentFrame);
  const isPlaying = useStore((s) => s.isPlaying);
  const splitAtPlayhead = useStore((s) => s.splitAtPlayhead);
  const mergeClips = useStore((s) => s.mergeClips);
  const selectedClipId = useStore((s) => s.selectedClipId);
  const selectedClipIds = useStore((s) => s.selectedClipIds);
  const removeClip = useStore((s) => s.removeClip);
  const setCurrentFrame = useStore((s) => s.setCurrentFrame);
  const replaceProject = useStore((s) => s.replaceProject);
  const undo = useStore((s) => s.undo);

  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exporting = exportStatus !== null && !exportStatus.startsWith("완료") && !exportStatus.startsWith("오류");

  const onExport = async () => {
    try {
      await exportProject(project, setExportStatus);
    } catch (e) {
      setExportStatus("오류: " + (e as Error).message);
    }
  };

  // restore the saved project (and its media) on first load
  useEffect(() => {
    loadProject().then((p) => {
      if (p) replaceProject(p);
    });
  }, [replaceProject]);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isPlaying()) p.pause();
    else p.play();
  };

  const seek = (frame: number) => {
    const f = Math.max(0, Math.min(project.durationInFrames - 1, Math.round(frame)));
    setCurrentFrame(f);
    playerRef.current?.seekTo(f);
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undo();
      } else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "s" || e.key === "S") {
        splitAtPlayhead();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const ids = useStore.getState().selectedClipIds;
        (ids.length ? ids : selectedClipId ? [selectedClipId] : []).forEach((id) => removeClip(id));
      } else if (e.key === "ArrowLeft") {
        seek(currentFrame - (e.shiftKey ? project.fps : 1));
      } else if (e.key === "ArrowRight") {
        seek(currentFrame + (e.shiftKey ? project.fps : 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentFrame, selectedClipId, project.fps, project.durationInFrames]);

  return (
    <div className="app">
      <header className="header">
        <span className="logo">🎬 Remotion 웹 에디터</span>
        <span className="muted" style={{ fontSize: 11 }}>
          컷편집 · 줌 · 애니메이션 · 영역 연출 효과
        </span>
        <div className="spacer" />
        {exportStatus && (
          <span className="muted" style={{ fontSize: 11 }}>
            {exportStatus}
          </span>
        )}
        <span className="muted" style={{ fontSize: 11 }}>
          {project.width}×{project.height} · {project.fps}fps · {(project.durationInFrames / project.fps).toFixed(1)}s
        </span>
        <button
          className="primary"
          onClick={onExport}
          disabled={exporting || project.clips.length === 0}
          title="전체 타임라인을 mp4로 내보냅니다 (로컬 렌더 서버 필요: npm run server). 60fps로 받으려면 캔버스 FPS를 60으로 설정하세요."
        >
          {exporting ? "⏳ 내보내는 중…" : "⬇ 내보내기 (mp4)"}
        </button>
      </header>

      <div className="main">
        <MediaPanel />
        <div className="center">
          <PreviewPanel playerRef={playerRef} />
          <div className="transport">
            <button onClick={() => seek(0)}>⏮</button>
            <button className="primary" onClick={togglePlay} style={{ minWidth: 56 }}>
              {isPlaying ? "❚❚ 정지" : "▶ 재생"}
            </button>
            <button onClick={() => seek(project.durationInFrames - 1)}>⏭</button>
            <button onClick={undo} title="되돌리기 (Ctrl+Z)">
              ↩ 되돌리기
            </button>
            <button onClick={splitAtPlayhead} title="플레이헤드에서 분할 (S)">
              ✂ 분할
            </button>
            <button
              disabled={selectedClipIds.length < 2}
              onClick={() => mergeClips(selectedClipIds)}
              title="선택한 분할 클립들을 하나로 합치기 (같은 트랙). Ctrl/⌘+클릭으로 여러 클립 선택"
            >
              🔗 합치기
            </button>
            <button className="danger" disabled={selectedClipIds.length === 0} onClick={() => selectedClipIds.forEach((id) => removeClip(id))}>
              🗑 삭제
            </button>
            <div className="spacer" style={{ flex: 1 }} />
            <span className="time">
              {fmt(currentFrame, project.fps)} / {fmt(project.durationInFrames, project.fps)}
            </span>
          </div>
          <Timeline playerRef={playerRef} />
        </div>
        <Inspector />
      </div>
    </div>
  );
};
