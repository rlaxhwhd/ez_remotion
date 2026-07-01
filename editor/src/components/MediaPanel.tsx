import React, { useState } from "react";
import { useStore } from "../store";
import { loadVideoMeta, loadImageMeta, loadAudioMeta, guessKind } from "../lib/media";
import { putAsset, saveProjectById } from "../lib/persist";

const newAssetId = () => Math.random().toString(36).slice(2, 12);

export const MediaPanel: React.FC = () => {
  const project = useStore((s) => s.project);
  const projectId = useStore((s) => s.projectId);
  const projectName = useStore((s) => s.projectName);
  const projectList = useStore((s) => s.projectList);
  const openProject = useStore((s) => s.openProject);
  const newProject = useStore((s) => s.newProject);
  const renameCurrentProject = useStore((s) => s.renameCurrentProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const addVideoClip = useStore((s) => s.addVideoClip);
  const addImageClip = useStore((s) => s.addImageClip);
  const addAudioClip = useStore((s) => s.addAudioClip);
  const addTextClip = useStore((s) => s.addTextClip);
  const addShapeClip = useStore((s) => s.addShapeClip);
  const [projectMsg, setProjectMsg] = useState("");

  const flash = (m: string) => {
    setProjectMsg(m);
    window.setTimeout(() => setProjectMsg(""), 2000);
  };
  const onSaveProject = () => {
    saveProjectById(projectId, projectName, project, true);
    flash("저장됨 ✓");
  };
  const onNewProject = () => {
    const name = window.prompt("새 프로젝트 이름", `프로젝트 ${projectList.length + 1}`);
    if (name === null) return;
    newProject(name);
    flash("새 프로젝트 ✓");
  };
  const onRenameProject = () => {
    const name = window.prompt("프로젝트 이름 변경", projectName);
    if (name === null) return;
    renameCurrentProject(name);
  };
  const onDeleteProject = () => {
    if (projectList.length <= 1) {
      flash("마지막 프로젝트는 삭제할 수 없습니다");
      return;
    }
    if (!window.confirm(`"${projectName}" 프로젝트를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    deleteProject(projectId);
    flash("삭제됨 ✓");
  };
  const setProjectMeta = useStore((s) => s.setProjectMeta);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fps = project.fps; // 클로저 캡처 전 고정
    for (const file of Array.from(files)) {
      const kind = guessKind(file);
      if (!kind) {
        alert(`"${file.name}"은 지원하지 않는 파일 형식입니다.`);
        continue;
      }
      try {
        // keep the raw bytes so the clip survives a page reload
        const assetId = newAssetId();
        await putAsset(assetId, file);
        if (kind === "video") {
          const m = await loadVideoMeta(file);
          addVideoClip({
            src: m.src,
            assetId,
            naturalWidth: m.width,
            naturalHeight: m.height,
            durationInFrames: Math.max(1, Math.round(m.durationSeconds * fps)),
            name: file.name,
          });
        } else if (kind === "image") {
          const m = await loadImageMeta(file);
          addImageClip({ src: m.src, assetId, naturalWidth: m.width, naturalHeight: m.height, name: file.name });
        } else if (kind === "audio") {
          const m = await loadAudioMeta(file);
          addAudioClip({
            src: m.src,
            assetId,
            durationInFrames: Math.max(1, Math.round(m.durationSeconds * fps)),
            name: file.name,
          });
        }
      } catch (err) {
        alert((err as Error).message);
      }
    }
  };

  const openFilePicker = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*,image/*,audio/*,.mov,.avi,.mkv,.m4v,.flv,.wmv,.ts,.mp4,.webm,.mp3,.wav,.aac,.m4a,.ogg,.flac";
    input.multiple = true;
    input.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none";
    document.body.appendChild(input);
    const cleanup = () => {
      if (document.body.contains(input)) document.body.removeChild(input);
    };
    input.addEventListener("change", () => {
      onFiles(input.files);
      cleanup();
    });
    // Chrome fires "cancel" when the dialog is dismissed without picking a file
    input.addEventListener("cancel", cleanup);
    input.click();
  };

  return (
    <div className="col">
      <div className="section">
        <h3>프로젝트</h3>
        <select value={projectId} onChange={(e) => openProject(e.target.value)} style={{ marginBottom: 6 }}>
          {projectList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="grid2">
          <button onClick={onNewProject}>➕ 새 프로젝트</button>
          <button onClick={onRenameProject}>✏️ 이름변경</button>
        </div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <button className="primary" onClick={onSaveProject}>💾 저장</button>
          <button className="danger" onClick={onDeleteProject} disabled={projectList.length <= 1}>
            🗑 삭제
          </button>
        </div>
        {projectMsg ? (
          <p className="hint">{projectMsg}</p>
        ) : (
          <p className="hint">위에서 프로젝트를 전환하거나 ➕로 새로 만드세요. 각 프로젝트는 자동 저장됩니다.</p>
        )}
      </div>

      <div className="section">
        <h3>미디어 추가</h3>
        <button className="primary" style={{ width: "100%", marginBottom: 8 }} onClick={openFilePicker}>
          ⬆ 파일 업로드 (영상/이미지/오디오)
        </button>
        <p className="hint">영상을 업로드하면 타임라인에 추가되고, 첫 영상 해상도가 프로젝트 캔버스로 적용됩니다.</p>
      </div>

      <div className="section">
        <h3>요소 추가</h3>
        <div className="grid2">
          <button onClick={addTextClip}>＋ 텍스트</button>
          <button onClick={addShapeClip}>＋ 도형</button>
        </div>
      </div>

      <div className="section">
        <h3>캔버스 설정</h3>
        <div className="grid2">
          <div className="field">
            <label>너비</label>
            <input
              type="number"
              value={project.width}
              onChange={(e) => setProjectMeta({ width: Math.max(16, Number(e.target.value)) })}
            />
          </div>
          <div className="field">
            <label>높이</label>
            <input
              type="number"
              value={project.height}
              onChange={(e) => setProjectMeta({ height: Math.max(16, Number(e.target.value)) })}
            />
          </div>
          <div className="field">
            <label>FPS</label>
            <input
              type="number"
              value={project.fps}
              onChange={(e) => setProjectMeta({ fps: Math.max(1, Math.min(60, Number(e.target.value))) })}
            />
          </div>
          <div className="field">
            <label>배경</label>
            <input type="color" value={project.background} onChange={(e) => setProjectMeta({ background: e.target.value })} />
          </div>
        </div>
        <div className="row wrap" style={{ marginTop: 4 }}>
          {[
            { l: "16:9 (1280×720)", w: 1280, h: 720 },
            { l: "16:9 1080p (1920×1080)", w: 1920, h: 1080 },
            { l: "9:16 (720×1280)", w: 720, h: 1280 },
            { l: "9:16 1080p (1080×1920)", w: 1080, h: 1920 },
            { l: "1:1 (1080)", w: 1080, h: 1080 },
          ].map((p) => (
            <button key={p.l} onClick={() => setProjectMeta({ width: p.w, height: p.h })}>
              {p.l}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>클립 목록</h3>
        {project.clips.length === 0 ? (
          <p className="hint">아직 클립이 없습니다.</p>
        ) : (
          project.clips.map((c) => <ClipListItem key={c.id} id={c.id} name={c.name} kind={c.kind} />)
        )}
      </div>
    </div>
  );
};

const ClipListItem: React.FC<{ id: string; name: string; kind: string }> = ({ id, name, kind }) => {
  const selected = useStore((s) => s.selectedClipId === id);
  const selectClip = useStore((s) => s.selectClip);
  return (
    <div className="chip" style={{ outline: selected ? "1px solid var(--accent-2)" : "none" }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} onClick={() => selectClip(id)}>
        <span className="muted">[{kind}]</span> {name}
      </span>
    </div>
  );
};
