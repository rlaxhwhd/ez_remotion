// Drives the local render server (server/render.mjs) to export the project to mp4.
import type { Project } from "../types";
import { getAsset } from "./persist";

const RENDER_BASE = "http://localhost:5280";

const extFromType = (type: string): string => {
  if (type.includes("mp4")) return "mp4";
  if (type.includes("webm")) return "webm";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("png")) return "png";
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("gif")) return "gif";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  if (type.includes("mp4a") || type.includes("m4a")) return "m4a";
  return "bin";
};

export async function exportProject(project: Project, onStatus: (msg: string) => void): Promise<void> {
  // 1. Upload each uploaded media file to the render server and rewrite its src
  //    to a URL the headless renderer can fetch (blob: URLs only exist in this tab).
  const out: Project = structuredClone(project);
  const uploaded = new Map<string, string>();
  const mediaClips = out.clips.filter((c) => (c as { assetId?: string }).assetId);
  let i = 0;
  for (const clip of mediaClips) {
    const assetId = (clip as { assetId?: string }).assetId!;
    let url = uploaded.get(assetId);
    if (!url) {
      const blob = await getAsset(assetId);
      if (!blob) continue;
      i += 1;
      onStatus(`미디어 업로드 ${i}/${uploaded.size + 1}…`);
      const ext = extFromType(blob.type);
      const resp = await fetch(`${RENDER_BASE}/upload?id=${assetId}&ext=${ext}`, { method: "POST", body: blob });
      if (!resp.ok) throw new Error("미디어 업로드 실패");
      url = (await resp.json()).url as string;
      uploaded.set(assetId, url);
    }
    (clip as { src: string }).src = url;
  }

  // 2. Ask the server to render and stream back the mp4.
  onStatus(`렌더링 중… (${project.width}×${project.height} · ${project.fps}fps · ${(project.durationInFrames / project.fps).toFixed(1)}s)`);
  let resp: Response;
  try {
    resp = await fetch(`${RENDER_BASE}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(out),
    });
  } catch {
    throw new Error("렌더 서버에 연결할 수 없습니다. 터미널에서 `npm run server`를 실행하세요.");
  }
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error("렌더 실패: " + t.slice(0, 300));
  }

  // 3. Download the result.
  const blob = await resp.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "export.mp4";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  onStatus("완료! mp4를 다운로드했습니다.");
}
