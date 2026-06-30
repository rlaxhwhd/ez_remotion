// Persist the project across reloads. Project metadata goes to localStorage;
// uploaded media bytes go to IndexedDB (blob: URLs die on refresh, so we keep
// the actual Blob and recreate object URLs on load).
import type { Project } from "../types";

const DB_NAME = "remotion-editor";
const STORE = "assets";
const PROJECT_KEY = "remotion-editor-project";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getAsset(id: string): Promise<Blob | undefined> {
  const db = await openDB();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export function saveProject(project: Project, force = false): void {
  // Don't let an auto-save clobber a real saved project with an empty one — e.g. when
  // a dev HMR reset momentarily empties the store. The manual Save button passes force.
  if (!force && project.clips.length === 0) return;
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
  } catch {
    // ignore quota / serialization errors
  }
}

// Load the saved project and recreate object URLs for media clips from IndexedDB.
export async function loadProject(): Promise<Project | null> {
  let project: Project;
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    project = JSON.parse(raw) as Project;
  } catch {
    return null;
  }
  const urlByAsset = new Map<string, string>();
  for (const clip of project.clips) {
    const assetId = (clip as { assetId?: string }).assetId;
    if (!assetId) continue;
    let url = urlByAsset.get(assetId);
    if (!url) {
      const blob = await getAsset(assetId);
      if (!blob) continue;
      url = URL.createObjectURL(blob);
      urlByAsset.set(assetId, url);
    }
    (clip as { src?: string }).src = url;
  }
  return project;
}
