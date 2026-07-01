import { create } from "zustand";
import type {
  Project,
  Clip,
  Track,
  VideoClip,
  ImageClip,
  TextClip,
  ShapeClip,
  AudioClip,
  AnimationInstance,
  EffectInstance,
  Rect,
  ParamValue,
} from "./types";
import { defaultTransform } from "./types";
import { animationRegistry, defaultParamsFor } from "./remotion/animations";
import { filterEffectRegistry, regionEffectRegistry } from "./remotion/effects";
import {
  saveProjectById,
  loadProjectById,
  listProjects,
  createProjectMeta,
  renameProjectMeta,
  deleteProjectData,
  ensureProjectsInitialized,
  setCurrentProjectId,
  type ProjectMeta,
} from "./lib/persist";

const uid = () => Math.random().toString(36).slice(2, 10);

// Undo history — snapshots of previous project states. Recorded via a store
// subscription; `suppressHistory` stops undo/load from recording themselves.
const undoPast: Project[] = [];
let suppressHistory = false;
const UNDO_LIMIT = 60;

const initialProject = (): Project => ({
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 150,
  background: "#000000",
  // Each added clip gets its own track (a vertical row in the timeline).
  tracks: [],
  clips: [],
});

export type ToolMode = "select" | "region";

type State = {
  project: Project;
  // Multiple named projects live in localStorage; this is the open one.
  projectId: string;
  projectName: string;
  projectList: ProjectMeta[];
  selectedClipId: string | null; // "primary" selection (drives the Inspector)
  selectedClipIds: string[]; // full multi-selection (Ctrl/⌘-click)
  currentFrame: number;
  isPlaying: boolean;
  tool: ToolMode;
  pixelsPerFrame: number;
  // region drawn on the preview, waiting to be applied as an effect
  pendingRegion: Rect | null;

  // playback / selection
  setCurrentFrame: (f: number) => void;
  setPlaying: (p: boolean) => void;
  selectClip: (id: string | null, additive?: boolean) => void;
  setTool: (t: ToolMode) => void;
  setPixelsPerFrame: (p: number) => void;
  setPendingRegion: (r: Rect | null) => void;
  setProjectMeta: (meta: Partial<Pick<Project, "width" | "height" | "fps" | "background">>) => void;
  replaceProject: (project: Project) => void;
  undo: () => void;

  // multiple projects (localStorage-backed)
  initProjects: () => Promise<void>;
  newProject: (name?: string) => void;
  openProject: (id: string) => Promise<void>;
  renameCurrentProject: (name: string) => void;
  deleteProject: (id: string) => Promise<void>;

  // adding clips
  addVideoClip: (data: { src: string; assetId?: string; naturalWidth: number; naturalHeight: number; durationInFrames: number; name: string }) => void;
  addImageClip: (data: { src: string; assetId?: string; naturalWidth: number; naturalHeight: number; name: string }) => void;
  addAudioClip: (data: { src: string; assetId?: string; durationInFrames: number; name: string }) => void;
  addTextClip: () => void;
  addShapeClip: () => void;

  // editing
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string) => void;
  duplicateClip: (id: string) => void;
  splitAtPlayhead: () => string | null;
  // Merge contiguous same-track clips back into one (undo a split). Keeps the
  // leftmost clip and unions every piece's animations/effects onto it.
  mergeClips: (ids: string[]) => void;
  moveClipStart: (id: string, start: number) => void;
  resizeClip: (id: string, edge: "start" | "end", newStart: number, newDuration: number, newTrimStart?: number) => void;
  // Change a video clip's playback speed: keeps the same source coverage (the whole
  // video still plays) AND scales its attached effect/animation bars proportionally
  // so they keep their relative place/length inside the now longer/shorter clip.
  setClipSpeed: (id: string, rate: number) => void;

  // animations
  addAnimation: (clipId: string, type: string, paramOverrides?: Record<string, ParamValue>) => void;
  // Mirror a clip's area zoom-in (zoomPush) with a matching zoom-out at its tail,
  // reusing the same region/strength so it returns to normal naturally.
  addMatchingZoomOut: (clipId: string) => void;
  removeAnimation: (clipId: string, animId: string) => void;
  updateAnimationParam: (clipId: string, animId: string, key: string, value: ParamValue) => void;

  // effects
  addEffect: (clipId: string, type: string, region?: Rect | null) => void;
  removeEffect: (clipId: string, effectId: string) => void;
  updateEffectParam: (clipId: string, effectId: string, key: string, value: ParamValue) => void;

  // independent timing of an animation/effect ("overlay") on the timeline
  setOverlayTiming: (clipId: string, cls: "anim" | "effect", id: string, start: number, duration: number) => void;

  // track z-order: "up" = move toward front of array = renders on top
  moveTrack: (trackId: string, dir: "up" | "down") => void;
};

const recalcDuration = (project: Project): number => {
  const end = project.clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  return Math.max(30, end);
};

const baseClip = (trackId: string, start: number, duration: number, kind: Clip["kind"], name: string) => ({
  id: uid(),
  trackId,
  kind,
  name,
  start,
  duration,
  transform: defaultTransform(),
  animations: [] as AnimationInstance[],
  effects: [] as EffectInstance[],
  transitionIn: { kind: "none" as const, durationInFrames: 15 },
});

// Create a dedicated track (one timeline row per clip) and return its id.
// Newest goes to the front of the list so it renders on top of older clips.
const spawnTrack = (project: Project, name: string, kind: Track["kind"]): string => {
  const id = uid();
  project.tracks.unshift({ id, name, kind, hidden: false, muted: false });
  return id;
};

export const useStore = create<State>((set, get) => {
  const mutateProject = (fn: (p: Project) => void) =>
    set((s) => {
      const project = structuredCloneProject(s.project);
      fn(project);
      project.durationInFrames = recalcDuration(project);
      return { project };
    });

  const mutateClip = (id: string, fn: (c: Clip) => void) =>
    mutateProject((p) => {
      const c = p.clips.find((x) => x.id === id);
      if (c) fn(c);
    });

  // place a new clip at the playhead on the appropriate track
  const placeStart = () => Math.round(get().currentFrame);

  // Swap in a whole project (startup load / new / switch). Not an undoable edit.
  const applyProject = (project: Project, id: string, name: string) => {
    setCurrentProjectId(id);
    suppressHistory = true;
    undoPast.length = 0;
    set({
      project,
      projectId: id,
      projectName: name,
      projectList: listProjects(),
      selectedClipId: null,
      selectedClipIds: [],
    });
    suppressHistory = false;
  };

  return {
    project: initialProject(),
    projectId: "",
    projectName: "프로젝트 1",
    projectList: [],
    selectedClipId: null,
    selectedClipIds: [],
    currentFrame: 0,
    isPlaying: false,
    tool: "select",
    pixelsPerFrame: 4,
    pendingRegion: null,

    setCurrentFrame: (f) => set({ currentFrame: Math.max(0, f) }),
    setPlaying: (p) => set({ isPlaying: p }),
    selectClip: (id, additive) =>
      set((s) => {
        if (id === null) return { selectedClipId: null, selectedClipIds: [] };
        if (additive) {
          const has = s.selectedClipIds.includes(id);
          const ids = has ? s.selectedClipIds.filter((x) => x !== id) : [...s.selectedClipIds, id];
          return { selectedClipIds: ids, selectedClipId: has ? (ids[ids.length - 1] ?? null) : id };
        }
        return { selectedClipId: id, selectedClipIds: [id] };
      }),
    setTool: (t) => set({ tool: t, pendingRegion: t === "select" ? null : get().pendingRegion }),
    setPixelsPerFrame: (p) => set({ pixelsPerFrame: Math.max(0.3, Math.min(40, p)) }),
    setPendingRegion: (r) => set({ pendingRegion: r }),
    setProjectMeta: (meta) => mutateProject((p) => Object.assign(p, meta)),
    replaceProject: (project) => {
      // a full load isn't an undoable edit — clear history and don't record it
      suppressHistory = true;
      undoPast.length = 0;
      set({ project, selectedClipId: null, selectedClipIds: [] });
      suppressHistory = false;
    },
    undo: () => {
      const project = undoPast.pop();
      if (!project) return;
      suppressHistory = true;
      set({ project, selectedClipId: null, selectedClipIds: [] });
      suppressHistory = false;
    },

    initProjects: async () => {
      const meta = ensureProjectsInitialized();
      const loaded = await loadProjectById(meta.id);
      applyProject(loaded ?? initialProject(), meta.id, meta.name);
    },
    newProject: (name) => {
      const st = get();
      saveProjectById(st.projectId, st.projectName, st.project); // flush the current one
      const nm = (name ?? "").trim() || `프로젝트 ${st.projectList.length + 1}`;
      const meta = createProjectMeta(nm);
      applyProject(initialProject(), meta.id, meta.name);
    },
    openProject: async (id) => {
      const st = get();
      if (id === st.projectId) return;
      saveProjectById(st.projectId, st.projectName, st.project); // flush the current one
      const loaded = await loadProjectById(id);
      const meta = listProjects().find((p) => p.id === id);
      applyProject(loaded ?? initialProject(), id, meta?.name ?? "프로젝트");
    },
    renameCurrentProject: (name) => {
      const nm = name.trim();
      if (!nm) return;
      const list = renameProjectMeta(get().projectId, nm);
      set({ projectName: nm, projectList: list });
    },
    deleteProject: async (id) => {
      const list = deleteProjectData(id);
      if (id !== get().projectId) {
        set({ projectList: list });
        return;
      }
      // Deleted the open project → switch to another (or a fresh one) WITHOUT
      // flushing the just-deleted one back to storage.
      if (list.length === 0) {
        const meta = createProjectMeta("프로젝트 1");
        applyProject(initialProject(), meta.id, meta.name);
      } else {
        const loaded = await loadProjectById(list[0].id);
        applyProject(loaded ?? initialProject(), list[0].id, list[0].name);
      }
    },

    addVideoClip: ({ src, assetId, naturalWidth, naturalHeight, durationInFrames, name }) => {
      const id = uid();
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clip: VideoClip = {
          ...baseClip(spawnTrack(project, name, "media"), Math.round(s.currentFrame), durationInFrames, "video", name),
          id,
          kind: "video",
          src,
          assetId,
          naturalWidth,
          naturalHeight,
          naturalDurationInFrames: durationInFrames,
          trimStart: 0,
          volume: 1,
          playbackRate: 1,
          muted: false,
        };
        project.clips.push(clip);
        if (project.clips.filter((c) => c.kind === "video").length === 1) {
          project.width = naturalWidth || project.width;
          project.height = naturalHeight || project.height;
        }
        project.durationInFrames = recalcDuration(project);
        return { project, selectedClipId: id };
      });
    },

    addImageClip: ({ src, assetId, naturalWidth, naturalHeight, name }) => {
      const id = uid();
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clip: ImageClip = {
          ...baseClip(spawnTrack(project, name, "media"), Math.round(s.currentFrame), 90, "image", name),
          id,
          kind: "image",
          src,
          assetId,
          naturalWidth,
          naturalHeight,
        };
        project.clips.push(clip);
        project.durationInFrames = recalcDuration(project);
        return { project, selectedClipId: id };
      });
    },

    addAudioClip: ({ src, assetId, durationInFrames, name }) => {
      const id = uid();
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clip: AudioClip = {
          ...baseClip(spawnTrack(project, name, "audio"), Math.round(s.currentFrame), durationInFrames, "audio", name),
          id,
          kind: "audio",
          src,
          assetId,
          naturalDurationInFrames: durationInFrames,
          trimStart: 0,
          volume: 1,
          muted: false,
        };
        project.clips.push(clip);
        project.durationInFrames = recalcDuration(project);
        return { project, selectedClipId: id };
      });
    },

    addTextClip: () => {
      const id = uid();
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clip: TextClip = {
          ...baseClip(spawnTrack(project, "텍스트", "media"), Math.round(s.currentFrame), 90, "text", "텍스트"),
          id,
          kind: "text",
          text: "여기에 텍스트",
          fontSize: 80,
          color: "#ffffff",
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          align: "center",
          background: "transparent",
        };
        project.clips.push(clip);
        project.durationInFrames = recalcDuration(project);
        return { project, selectedClipId: id };
      });
    },

    addShapeClip: () => {
      const id = uid();
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clip: ShapeClip = {
          ...baseClip(spawnTrack(project, "도형", "media"), Math.round(s.currentFrame), 90, "shape", "도형"),
          id,
          kind: "shape",
          shape: "rect",
          fill: "#3b82f6",
          width: 300,
          height: 300,
          cornerRadius: 20,
        };
        project.clips.push(clip);
        project.durationInFrames = recalcDuration(project);
        return { project, selectedClipId: id };
      });
    },

    updateClip: (id, patch) => mutateClip(id, (c) => Object.assign(c, patch)),

    setClipSpeed: (id, rate) =>
      mutateClip(id, (c) => {
        if (c.kind !== "video") return;
        const v = c as VideoClip;
        const oldDur = v.duration;
        // preserve source coverage: duration * rate stays constant → whole video plays
        const newDur = Math.max(1, Math.round((oldDur * v.playbackRate) / rate));
        const factor = newDur / oldDur;
        v.playbackRate = rate;
        v.duration = newDur;
        const end = c.start + newDur;
        // Scale independently-timed overlay bars so they keep their relative spot/length.
        // (Overlays without an explicit start/duration follow clip.duration automatically.)
        const scale = (o: { start?: number; duration?: number }) => {
          if (o.start !== undefined) {
            o.start = Math.round(c.start + (o.start - c.start) * factor);
            o.start = Math.max(c.start, Math.min(o.start, end - 1));
          }
          if (o.duration !== undefined) {
            o.duration = Math.max(1, Math.round(o.duration * factor));
            o.duration = Math.min(o.duration, end - (o.start ?? c.start));
          }
        };
        v.animations.forEach(scale);
        v.effects.forEach(scale);
      }),

    removeClip: (id) =>
      set((s) => {
        const project = structuredCloneProject(s.project);
        project.clips = project.clips.filter((c) => c.id !== id);
        // Drop the clip's now-empty track so no blank row lingers.
        project.tracks = project.tracks.filter((t) => project.clips.some((c) => c.trackId === t.id));
        project.durationInFrames = recalcDuration(project);
        return {
          project,
          selectedClipId: s.selectedClipId === id ? null : s.selectedClipId,
          selectedClipIds: s.selectedClipIds.filter((x) => x !== id),
        };
      }),

    duplicateClip: (id) =>
      mutateProject((p) => {
        const c = p.clips.find((x) => x.id === id);
        if (!c) return;
        const copy: Clip = {
          ...structuredClone(c),
          id: uid(),
          start: c.start + c.duration,
          effects: c.effects.map((e) => ({ ...e, id: uid() })),
          animations: c.animations.map((a) => ({ ...a, id: uid() })),
        };
        p.clips.push(copy);
      }),

    splitAtPlayhead: () => {
      const { selectedClipId, currentFrame } = get();
      if (!selectedClipId) return null;
      const rightId = uid();
      let didSplit = false;
      set((s) => {
        const project = structuredCloneProject(s.project);
        const idx = project.clips.findIndex((c) => c.id === selectedClipId);
        if (idx < 0) return { project };
        const c = project.clips[idx];
        const local = Math.round(currentFrame) - c.start;
        if (local <= 0 || local >= c.duration) return { project };
        didSplit = true;
        const right: Clip = {
          ...structuredClone(c),
          id: rightId,
          start: c.start + local,
          duration: c.duration - local,
          effects: c.effects.map((e) => ({ ...e, id: uid() })),
          animations: c.animations.map((a) => ({ ...a, id: uid() })),
        };
        if (right.kind === "video" || right.kind === "audio") {
          // Advance the right half's trim by the SOURCE frames consumed up to the
          // playhead: `local` timeline frames play `local * playbackRate` source frames.
          // (Audio has no playbackRate → rate 1.) Using `local` alone skipped ahead and
          // cut the video whenever the speed wasn't 1.
          const rate = right.kind === "video" ? (right as VideoClip).playbackRate : 1;
          (right as VideoClip | AudioClip).trimStart =
            (c as VideoClip | AudioClip).trimStart + Math.round(local * rate);
        }
        c.duration = local;
        project.clips.splice(idx + 1, 0, right);
        project.durationInFrames = recalcDuration(project);
        return { project };
      });
      return didSplit ? rightId : null;
    },

    mergeClips: (ids) =>
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clips = ids
          .map((id) => project.clips.find((c) => c.id === id))
          .filter((c): c is Clip => !!c)
          .sort((a, b) => a.start - b.start);
        if (clips.length < 2) return {};
        // only merge clips on the same track (row)
        const trackId = clips[0].trackId;
        if (!clips.every((c) => c.trackId === trackId)) return {};
        const base = clips[0];
        const end = Math.max(...clips.map((c) => c.start + c.duration));
        base.duration = end - base.start;
        // union every piece's overlays onto the base, dropping exact duplicates
        // (split copies the same effect onto both halves with fresh ids).
        base.animations = dedupOverlays(clips.flatMap((c) => c.animations));
        base.effects = dedupOverlays(clips.flatMap((c) => c.effects));
        const dropped = new Set(clips.slice(1).map((c) => c.id));
        project.clips = project.clips.filter((c) => !dropped.has(c.id));
        project.tracks = project.tracks.filter((t) => project.clips.some((c) => c.trackId === t.id));
        project.durationInFrames = recalcDuration(project);
        return { project, selectedClipId: base.id, selectedClipIds: [base.id] };
      }),

    moveClipStart: (id, start) => mutateClip(id, (c) => (c.start = Math.max(0, Math.round(start)))),

    resizeClip: (id, _edge, newStart, newDuration, newTrimStart) =>
      mutateClip(id, (c) => {
        c.start = Math.max(0, Math.round(newStart));
        c.duration = Math.max(1, Math.round(newDuration));
        if (newTrimStart !== undefined && (c.kind === "video" || c.kind === "audio")) {
          (c as VideoClip | AudioClip).trimStart = Math.max(0, Math.round(newTrimStart));
        }
      }),

    addAnimation: (clipId, type, paramOverrides) =>
      mutateClip(clipId, (c) => {
        const def = animationRegistry[type];
        if (!def) return;
        c.animations.push({
          id: uid(),
          type,
          params: { ...defaultParamsFor(def.params), ...paramOverrides },
          start: c.start,
          duration: c.duration,
        });
      }),

    addMatchingZoomOut: (clipId) =>
      mutateProject((p) => {
        const c = p.clips.find((x) => x.id === clipId);
        if (!c) return;
        // mirror the most recent area zoom-in on this clip
        const push = [...c.animations].reverse().find((a) => a.type === "zoomPush");
        if (!push) return;
        const numOf = (k: string, d: number) => (typeof push.params[k] === "number" ? (push.params[k] as number) : d);
        const to = numOf("to", 2);
        const toX = numOf("toX", 0);
        const toY = numOf("toY", 0);
        const popSecs = numOf("duration", 1.0);
        // zoom-out takes the clip tail (at most half, leaving room for the zoom-in + hold)
        const popFrames = Math.max(1, Math.min(Math.round(popSecs * p.fps), Math.floor(c.duration / 2)));
        const popStart = c.start + c.duration - popFrames;
        // end the zoom-in's hold exactly where the zoom-out starts so they don't stack
        const pushStart = push.start ?? c.start;
        push.duration = Math.max(1, popStart - pushStart);
        c.animations.push({
          id: uid(),
          type: "zoomPop",
          params: { to, toX, toY, duration: popSecs },
          start: popStart,
          duration: popFrames,
        });
      }),

    removeAnimation: (clipId, animId) =>
      mutateClip(clipId, (c) => {
        c.animations = c.animations.filter((a) => a.id !== animId);
      }),

    updateAnimationParam: (clipId, animId, key, value) =>
      mutateClip(clipId, (c) => {
        const a = c.animations.find((x) => x.id === animId);
        if (a) a.params = { ...a.params, [key]: value };
      }),

    addEffect: (clipId, type, region) =>
      mutateClip(clipId, (c) => {
        // `type` may be a filter, a region effect, or an animation applied to a region.
        const def = filterEffectRegistry[type] ?? regionEffectRegistry[type] ?? animationRegistry[type];
        if (!def) return;
        c.effects.push({
          id: uid(),
          type,
          params: defaultParamsFor(def.params),
          region: region ?? null,
          start: c.start,
          duration: c.duration,
        });
      }),

    removeEffect: (clipId, effectId) =>
      mutateClip(clipId, (c) => {
        c.effects = c.effects.filter((e) => e.id !== effectId);
      }),

    updateEffectParam: (clipId, effectId, key, value) =>
      mutateClip(clipId, (c) => {
        const e = c.effects.find((x) => x.id === effectId);
        if (e) e.params = { ...e.params, [key]: value };
      }),

    setOverlayTiming: (clipId, cls, id, start, duration) =>
      mutateClip(clipId, (c) => {
        // clamp the overlay window to the clip's visible range
        const lo = c.start;
        const hi = c.start + c.duration;
        let s = Math.round(start);
        let d = Math.max(1, Math.round(duration));
        s = Math.max(lo, Math.min(s, hi - 1));
        d = Math.min(d, hi - s);
        const item = (cls === "anim" ? c.animations : c.effects).find((x) => x.id === id);
        if (item) {
          item.start = s;
          item.duration = d;
        }
      }),

    moveTrack: (trackId, dir) =>
      mutateProject((p) => {
        const i = p.tracks.findIndex((t) => t.id === trackId);
        if (i === -1) return;
        const j = dir === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= p.tracks.length) return;
        [p.tracks[i], p.tracks[j]] = [p.tracks[j], p.tracks[i]];
      }),
  };
});

// structuredClone fails on nothing here (all plain data), but keep a helper for clarity.
function structuredCloneProject(p: Project): Project {
  return structuredClone(p);
}

// Drop overlays that are identical in type+params+region (the duplicate copies a
// split leaves on both halves), keeping the first. Used when merging clips.
function dedupOverlays<T extends AnimationInstance | EffectInstance>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((o) => {
    const region = "region" in o ? (o as EffectInstance).region : null;
    const key = `${o.type}|${JSON.stringify(o.params)}|${JSON.stringify(region ?? null)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Record undo history: push the previous project before each change. Rapid bursts
// (e.g. a drag firing on every mousemove) are coalesced into a single entry so one
// undo reverts the whole gesture.
let lastHistoryTime = 0;
useStore.subscribe((s, prev) => {
  if (suppressHistory || s.project === prev.project) return;
  const now = Date.now();
  if (now - lastHistoryTime < 500) return;
  lastHistoryTime = now;
  undoPast.push(prev.project);
  if (undoPast.length > UNDO_LIMIT) undoPast.shift();
});

// Persist the open project to its own localStorage slot whenever it changes (debounced).
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const st = useStore.getState();
    saveProjectById(st.projectId, st.projectName, st.project);
  }, 300);
});

export const selectedClip = (s: State): Clip | null =>
  s.project.clips.find((c) => c.id === s.selectedClipId) ?? null;

// Dev-only hook so the store can be driven from the browser console / e2e checks.
if (import.meta.env.DEV) {
  (window as unknown as { __editorStore?: typeof useStore }).__editorStore = useStore;
}
