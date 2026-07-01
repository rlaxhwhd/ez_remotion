// Persist the project across reloads. Project metadata goes to localStorage;
// uploaded media bytes go to IndexedDB (blob: URLs die on refresh, so we keep
// the actual Blob and recreate object URLs on load).
import type { Project } from "../types";

const DB_NAME = "remotion-editor";
const STORE = "assets";
const PROJECT_KEY = "remotion-editor-project"; // legacy single-slot save (migrated on first run)
const INDEX_KEY = "remotion-editor-projects"; // list of { id, name }
const CURRENT_KEY = "remotion-editor-current"; // id of the last-open project
const dataKey = (id: string) => `remotion-editor-project:${id}`;
const uid = () => Math.random().toString(36).slice(2, 10);

export type ProjectMeta = { id: string; name: string };

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

// Recreate object URLs for a project's media clips from IndexedDB (blob: URLs die
// on reload, so we keep the bytes and re-mint URLs here).
async function rehydrateMedia(project: Project): Promise<void> {
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
}

export function listProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) return JSON.parse(raw) as ProjectMeta[];
  } catch {
    /* ignore */
  }
  return [];
}

function writeIndex(list: ProjectMeta[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

export function getCurrentProjectId(): string | null {
  return localStorage.getItem(CURRENT_KEY);
}
export function setCurrentProjectId(id: string): void {
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* ignore */
  }
}

// Save a project's data under its id and upsert its index entry. Skips an empty
// auto-save (unless forced) so a momentary store reset can't clobber a real save.
export function saveProjectById(id: string, name: string, project: Project, force = false): void {
  if (!id || (!force && project.clips.length === 0)) return;
  try {
    localStorage.setItem(dataKey(id), JSON.stringify(project));
    const list = listProjects();
    const i = list.findIndex((p) => p.id === id);
    if (i >= 0) list[i] = { id, name };
    else list.push({ id, name });
    writeIndex(list);
  } catch {
    /* ignore quota / serialization errors */
  }
}

// Load a project's data by id, recreating its media object URLs.
export async function loadProjectById(id: string): Promise<Project | null> {
  let project: Project;
  try {
    const raw = localStorage.getItem(dataKey(id));
    if (!raw) return null;
    project = JSON.parse(raw) as Project;
  } catch {
    return null;
  }
  await rehydrateMedia(project);
  return project;
}

export function createProjectMeta(name: string): ProjectMeta {
  const meta: ProjectMeta = { id: uid(), name };
  const list = listProjects();
  list.push(meta);
  writeIndex(list);
  return meta;
}

export function renameProjectMeta(id: string, name: string): ProjectMeta[] {
  const list = listProjects();
  const i = list.findIndex((p) => p.id === id);
  if (i >= 0) {
    list[i] = { id, name };
    writeIndex(list);
  }
  return list;
}

export function deleteProjectData(id: string): ProjectMeta[] {
  try {
    localStorage.removeItem(dataKey(id));
  } catch {
    /* ignore */
  }
  const list = listProjects().filter((p) => p.id !== id);
  writeIndex(list);
  return list;
}

// Ensure at least one project exists — migrating the legacy single-slot save the
// first time — and return the project to open (last-current, else the first).
export function ensureProjectsInitialized(): ProjectMeta {
  let list = listProjects();
  if (list.length === 0) {
    const meta: ProjectMeta = { id: uid(), name: "프로젝트 1" };
    const legacy = localStorage.getItem(PROJECT_KEY);
    if (legacy) {
      try {
        localStorage.setItem(dataKey(meta.id), legacy);
      } catch {
        /* ignore */
      }
    }
    list = [meta];
    writeIndex(list);
    setCurrentProjectId(meta.id);
    return meta;
  }
  const currentId = getCurrentProjectId();
  const current = list.find((p) => p.id === currentId) ?? list[0];
  setCurrentProjectId(current.id);
  return current;
}
