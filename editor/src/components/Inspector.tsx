import React, { useState } from "react";
import { useStore, selectedClip } from "../store";
import { ParamControls } from "./ParamControls";
import { animationList, animationRegistry } from "../remotion/animations";
import {
  filterEffectList,
  filterEffectRegistry,
  regionEffectList,
  regionEffectRegistry,
} from "../remotion/effects";
import { parseRegionCommand } from "../lib/regionCommand";
import type { Clip, TransitionKind, VideoClip } from "../types";

const transitionKinds: { value: TransitionKind; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "fade", label: "페이드" },
  { value: "slide", label: "슬라이드" },
  { value: "wipe", label: "와이프" },
  { value: "flip", label: "플립" },
  { value: "clockWipe", label: "세로 와이프" },
];

export const Inspector: React.FC = () => {
  const clip = useStore(selectedClip);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const pendingRegion = useStore((s) => s.pendingRegion);
  const setPendingRegion = useStore((s) => s.setPendingRegion);

  const project = useStore((s) => s.project);
  const currentFrame = useStore((s) => s.currentFrame);
  const updateClip = useStore((s) => s.updateClip);
  const removeClip = useStore((s) => s.removeClip);
  const duplicateClip = useStore((s) => s.duplicateClip);
  const splitAtPlayhead = useStore((s) => s.splitAtPlayhead);
  const addAnimation = useStore((s) => s.addAnimation);
  const removeAnimation = useStore((s) => s.removeAnimation);
  const updateAnimationParam = useStore((s) => s.updateAnimationParam);
  const addEffect = useStore((s) => s.addEffect);
  const removeEffect = useStore((s) => s.removeEffect);
  const updateEffectParam = useStore((s) => s.updateEffectParam);

  const [regionSelect, setRegionSelect] = useState("regionBlur");
  const [regionCmd, setRegionCmd] = useState("");

  if (!clip) {
    return (
      <div className="col right">
        <div className="empty-hint">
          왼쪽에서 영상을 업로드하고
          <br />
          타임라인의 클립을 선택하면
          <br />
          여기에서 효과·애니메이션을
          <br />
          편집할 수 있습니다.
        </div>
      </div>
    );
  }

  const applyRegion = (type: string) => {
    if (!pendingRegion) {
      alert("먼저 미리보기에서 '영역 선택' 도구로 영역을 드래그하세요.");
      return;
    }

    if (type === "zoomToRegion") {
      // 선택 영역 기준 줌 파라미터 계산
      const cx = pendingRegion.x + pendingRegion.width / 2;
      const cy = pendingRegion.y + pendingRegion.height / 2;
      const targetScale = parseFloat(
        Math.min(4, 1 / Math.max(pendingRegion.width, pendingRegion.height, 0.05)).toFixed(2)
      );
      // 줌 시 선택 영역 중심이 캔버스 중앙에 오도록 이동량 계산
      const toX = Math.round(targetScale * (0.5 - cx) * project.width);
      const toY = Math.round(targetScale * (0.5 - cy) * project.height);

      // 플레이헤드 위치에서 클립을 자르고, 오른쪽 클립에 줌 애니메이션 삽입
      const local = Math.round(currentFrame) - clip.start;
      let targetId = clip.id;
      if (local > 0 && local < clip.duration) {
        const rightId = splitAtPlayhead();
        if (rightId) targetId = rightId;
      }
      addAnimation(targetId, "zoomPush", { to: targetScale, toX, toY });
    } else {
      addEffect(clip.id, type, pendingRegion);
    }

    setPendingRegion(null);
    setTool("select");
  };

  const onCommand = () => {
    const type = parseRegionCommand(regionCmd);
    if (!type) {
      // eslint-disable-next-line no-alert
      alert("인식할 수 없는 명령입니다. 예: '줌', '블러 20', '모자이크', '스포트라이트', '강조'");
      return;
    }
    applyRegion(type);
    setRegionCmd("");
  };

  return (
    <div className="col right">
      {/* Header */}
      <div className="section">
        <div className="row">
          <strong style={{ fontSize: 13 }}>{clip.name}</strong>
          <span className="badge">{clip.kind}</span>
        </div>
        <div className="row">
          <button onClick={() => duplicateClip(clip.id)}>복제</button>
          <button className="danger" onClick={() => removeClip(clip.id)}>
            삭제
          </button>
        </div>
      </div>

      <ClipSpecificProps clip={clip} updateClip={updateClip} />

      {/* Transform */}
      {clip.kind !== "audio" && (
        <div className="section">
          <h3>변형</h3>
          <div className="grid2">
            <NumField label="X" value={clip.transform.x} step={5} onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, x: v } })} />
            <NumField label="Y" value={clip.transform.y} step={5} onChange={(v) => updateClip(clip.id, { transform: { ...clip.transform, y: v } })} />
          </div>
          <div className="field">
            <label>배율 · {clip.transform.scale.toFixed(2)}</label>
            <input type="range" min={0.1} max={4} step={0.01} value={clip.transform.scale} onChange={(e) => updateClip(clip.id, { transform: { ...clip.transform, scale: Number(e.target.value) } })} />
          </div>
          <div className="field">
            <label>회전 · {clip.transform.rotation}°</label>
            <input type="range" min={-180} max={180} step={1} value={clip.transform.rotation} onChange={(e) => updateClip(clip.id, { transform: { ...clip.transform, rotation: Number(e.target.value) } })} />
          </div>
          <div className="field">
            <label>불투명도 · {clip.transform.opacity.toFixed(2)}</label>
            <input type="range" min={0} max={1} step={0.01} value={clip.transform.opacity} onChange={(e) => updateClip(clip.id, { transform: { ...clip.transform, opacity: Number(e.target.value) } })} />
          </div>
        </div>
      )}

      {/* Transition */}
      {clip.kind !== "audio" && (
        <div className="section">
          <h3>등장 트랜지션</h3>
          <div className="field">
            <select
              value={clip.transitionIn.kind}
              onChange={(e) => updateClip(clip.id, { transitionIn: { ...clip.transitionIn, kind: e.target.value as TransitionKind } })}
            >
              {transitionKinds.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {clip.transitionIn.kind !== "none" && (
            <div className="field">
              <label>길이(프레임) · {clip.transitionIn.durationInFrames}</label>
              <input
                type="range"
                min={2}
                max={60}
                step={1}
                value={clip.transitionIn.durationInFrames}
                onChange={(e) => updateClip(clip.id, { transitionIn: { ...clip.transitionIn, durationInFrames: Number(e.target.value) } })}
              />
            </div>
          )}
        </div>
      )}

      {/* Animations */}
      {clip.kind !== "audio" && (
        <div className="section">
          <h3>애니메이션 (줌인/줌아웃 포함)</h3>
          <div className="field">
            <select id="anim-add" defaultValue="">
              <option value="" disabled>
                ＋ 애니메이션 추가…
              </option>
              {animationList.map((a) => (
                <option key={a.type} value={a.type}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <button
            style={{ width: "100%", marginBottom: 8 }}
            onClick={() => {
              const sel = document.getElementById("anim-add") as HTMLSelectElement;
              if (sel?.value) {
                addAnimation(clip.id, sel.value);
                sel.value = "";
              }
            }}
          >
            추가
          </button>
          {clip.animations.length === 0 && <p className="hint">줌인/줌아웃, 페이드, 슬라이드, 회전 등.</p>}
          {clip.animations.map((a) => {
            const def = animationRegistry[a.type];
            if (!def) return null;
            return (
              <div key={a.id} className="section" style={{ padding: "8px 0", borderBottom: "none" }}>
                <div className="chip">
                  <strong>{def.label}</strong>
                  <span className="x" onClick={() => removeAnimation(clip.id, a.id)}>
                    ✕
                  </span>
                </div>
                <ParamControls specs={def.params} values={a.params} onChange={(k, v) => updateAnimationParam(clip.id, a.id, k, v)} />
              </div>
            );
          })}
        </div>
      )}

      {/* Selection-area tool */}
      {clip.kind !== "audio" && (
        <div className="section">
          <h3>영역 선택 도구 (연출 효과)</h3>
          <div className="row">
            <button className={tool === "region" ? "active" : ""} onClick={() => setTool(tool === "region" ? "select" : "region")}>
              {tool === "region" ? "■ 영역 선택 중…" : "▢ 영역 선택 시작"}
            </button>
            {pendingRegion && <span className="muted">영역 지정됨 ✓</span>}
          </div>
          <p className="hint">미리보기에서 드래그해 영역을 지정한 뒤, 아래에서 효과를 적용하세요.</p>

          <div className="field">
            <label>① 셀렉트 박스로 선택</label>
            <select value={regionSelect} onChange={(e) => setRegionSelect(e.target.value)}>
              {regionEffectList.map((r) => (
                <option key={r.type} value={r.type}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button className="primary" style={{ width: "100%", marginBottom: 10 }} onClick={() => applyRegion(regionSelect)}>
            선택 영역에 적용
          </button>

          <div className="field">
            <label>② 또는 텍스트 명령</label>
            <input
              type="text"
              placeholder="예: 줌 / 블러 / 모자이크 / 스포트라이트 / 강조"
              value={regionCmd}
              onChange={(e) => setRegionCmd(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCommand()}
            />
          </div>
          <button style={{ width: "100%", marginBottom: 10 }} onClick={onCommand}>
            명령 적용
          </button>

          <label className="muted" style={{ display: "block", marginBottom: 4 }}>③ 버튼으로 빠르게</label>
          <div className="row wrap">
            {regionEffectList.map((r) => (
              <button key={r.type} onClick={() => applyRegion(r.type)} style={{ fontSize: 11 }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Full-frame filter effects */}
      {(clip.kind === "video" || clip.kind === "image") && (
        <div className="section">
          <h3>영상 필터 (Remotion 효과)</h3>
          <div className="field">
            <select id="filter-add" defaultValue="">
              <option value="" disabled>
                ＋ 필터 추가…
              </option>
              {filterEffectList.map((f) => (
                <option key={f.type} value={f.type}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <button
            style={{ width: "100%" }}
            onClick={() => {
              const sel = document.getElementById("filter-add") as HTMLSelectElement;
              if (sel?.value) {
                addEffect(clip.id, sel.value);
                sel.value = "";
              }
            }}
          >
            추가
          </button>
        </div>
      )}

      {/* Applied effects list (filter + region) */}
      {clip.effects.length > 0 && (
        <div className="section">
          <h3>적용된 효과</h3>
          {clip.effects.map((e) => {
            const def = filterEffectRegistry[e.type] ?? regionEffectRegistry[e.type];
            if (!def) return null;
            const isRegion = e.type in regionEffectRegistry;
            return (
              <div key={e.id} style={{ marginBottom: 8 }}>
                <div className="chip">
                  <strong>
                    {def.label}
                    {isRegion && <span className="muted"> · 영역</span>}
                  </strong>
                  <span className="x" onClick={() => removeEffect(clip.id, e.id)}>
                    ✕
                  </span>
                </div>
                <ParamControls specs={def.params} values={e.params} onChange={(k, v) => updateEffectParam(clip.id, e.id, k, v)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const NumField: React.FC<{ label: string; value: number; step?: number; onChange: (v: number) => void }> = ({ label, value, step, onChange }) => (
  <div className="field">
    <label>{label}</label>
    <input type="number" step={step ?? 1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </div>
);

const ClipSpecificProps: React.FC<{ clip: Clip; updateClip: (id: string, patch: Partial<Clip>) => void }> = ({ clip, updateClip }) => {
  if (clip.kind === "text") {
    return (
      <div className="section">
        <h3>텍스트</h3>
        <div className="field">
          <textarea rows={2} value={clip.text} onChange={(e) => updateClip(clip.id, { text: e.target.value })} />
        </div>
        <div className="grid2">
          <NumField label="크기" value={clip.fontSize} onChange={(v) => updateClip(clip.id, { fontSize: v })} />
          <NumField label="굵기" value={clip.fontWeight} step={100} onChange={(v) => updateClip(clip.id, { fontWeight: v })} />
        </div>
        <div className="grid2">
          <div className="field">
            <label>색상</label>
            <input type="color" value={clip.color} onChange={(e) => updateClip(clip.id, { color: e.target.value })} />
          </div>
          <div className="field">
            <label>정렬</label>
            <select value={clip.align} onChange={(e) => updateClip(clip.id, { align: e.target.value as "left" | "center" | "right" })}>
              <option value="left">왼쪽</option>
              <option value="center">가운데</option>
              <option value="right">오른쪽</option>
            </select>
          </div>
        </div>
      </div>
    );
  }
  if (clip.kind === "shape") {
    return (
      <div className="section">
        <h3>도형</h3>
        <div className="field">
          <label>모양</label>
          <select value={clip.shape} onChange={(e) => updateClip(clip.id, { shape: e.target.value as typeof clip.shape })}>
            <option value="rect">사각형</option>
            <option value="circle">원</option>
            <option value="ellipse">타원</option>
            <option value="triangle">삼각형</option>
            <option value="star">별</option>
          </select>
        </div>
        <div className="grid2">
          <NumField label="너비" value={clip.width} step={10} onChange={(v) => updateClip(clip.id, { width: v })} />
          <NumField label="높이" value={clip.height} step={10} onChange={(v) => updateClip(clip.id, { height: v })} />
        </div>
        <div className="field">
          <label>색상</label>
          <input type="color" value={clip.fill} onChange={(e) => updateClip(clip.id, { fill: e.target.value })} />
        </div>
      </div>
    );
  }
  if (clip.kind === "video" || clip.kind === "audio") {
    const v = clip as VideoClip;
    return (
      <div className="section">
        <h3>{clip.kind === "video" ? "비디오" : "오디오"}</h3>
        <div className="field">
          <label>볼륨 · {(v.volume * 100).toFixed(0)}%</label>
          <input type="range" min={0} max={1} step={0.01} value={v.volume} onChange={(e) => updateClip(clip.id, { volume: Number(e.target.value) } as Partial<Clip>)} />
        </div>
        {clip.kind === "video" && (
          <div className="field">
            <label>재생 속도 · {v.playbackRate}x</label>
            <input type="range" min={0.25} max={3} step={0.05} value={v.playbackRate} onChange={(e) => updateClip(clip.id, { playbackRate: Number(e.target.value) } as Partial<Clip>)} />
          </div>
        )}
        <label className="row">
          <input type="checkbox" style={{ width: "auto" }} checked={v.muted} onChange={(e) => updateClip(clip.id, { muted: e.target.checked } as Partial<Clip>)} /> 음소거
        </label>
      </div>
    );
  }
  return null;
};
