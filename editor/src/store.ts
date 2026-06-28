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

const uid = () => Math.random().toString(36).slice(2, 10);

const MEDIA_TRACK = "track-media";
const AUDIO_TRACK = "track-audio";

const initialProject = (): Project => ({
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 150,
  background: "#000000",
  tracks: [
    { id: MEDIA_TRACK, name: "비디오/이미지", kind: "media", hidden: false, muted: false },
    { id: AUDIO_TRACK, name: "오디오", kind: "audio", hidden: false, muted: false },
  ],
  clips: [],
});

export type ToolMode = "select" | "region";

type State = {
  project: Project;
  selectedClipId: string | null;
  currentFrame: number;
  isPlaying: boolean;
  tool: ToolMode;
  pixelsPerFrame: number;
  // region drawn on the preview, waiting to be applied as an effect
  pendingRegion: Rect | null;

  // playback / selection
  setCurrentFrame: (f: number) => void;
  setPlaying: (p: boolean) => void;
  selectClip: (id: string | null) => void;
  setTool: (t: ToolMode) => void;
  setPixelsPerFrame: (p: number) => void;
  setPendingRegion: (r: Rect | null) => void;
  setProjectMeta: (meta: Partial<Pick<Project, "width" | "height" | "fps" | "background">>) => void;

  // adding clips
  addVideoClip: (data: { src: string; naturalWidth: number; naturalHeight: number; durationInFrames: number; name: string }) => void;
  addImageClip: (data: { src: string; naturalWidth: number; naturalHeight: number; name: string }) => void;
  addAudioClip: (data: { src: string; durationInFrames: number; name: string }) => void;
  addTextClip: () => void;
  addShapeClip: () => void;

  // editing
  updateClip: (id: string, patch: Partial<Clip>) => void;
  removeClip: (id: string) => void;
  duplicateClip: (id: string) => void;
  splitAtPlayhead: () => string | null;
  moveClipStart: (id: string, start: number) => void;
  resizeClip: (id: string, edge: "start" | "end", newStart: number, newDuration: number, newTrimStart?: number) => void;

  // animations
  addAnimation: (clipId: string, type: string, paramOverrides?: Record<string, ParamValue>) => void;
  removeAnimation: (clipId: string, animId: string) => void;
  updateAnimationParam: (clipId: string, animId: string, key: string, value: ParamValue) => void;

  // effects
  addEffect: (clipId: string, type: string, region?: Rect | null) => void;
  removeEffect: (clipId: string, effectId: string) => void;
  updateEffectParam: (clipId: string, effectId: string, key: string, value: ParamValue) => void;
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

  return {
    project: initialProject(),
    selectedClipId: null,
    currentFrame: 0,
    isPlaying: false,
    tool: "select",
    pixelsPerFrame: 4,
    pendingRegion: null,

    setCurrentFrame: (f) => set({ currentFrame: Math.max(0, f) }),
    setPlaying: (p) => set({ isPlaying: p }),
    selectClip: (id) => set({ selectedClipId: id }),
    setTool: (t) => set({ tool: t, pendingRegion: t === "select" ? null : get().pendingRegion }),
    setPixelsPerFrame: (p) => set({ pixelsPerFrame: Math.max(0.3, Math.min(40, p)) }),
    setPendingRegion: (r) => set({ pendingRegion: r }),
    setProjectMeta: (meta) => mutateProject((p) => Object.assign(p, meta)),

    addVideoClip: ({ src, naturalWidth, naturalHeight, durationInFrames, name }) => {
      const id = uid();
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clip: VideoClip = {
          ...baseClip(MEDIA_TRACK, Math.round(s.currentFrame), durationInFrames, "video", name),
          id,
          kind: "video",
          src,
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

    addImageClip: ({ src, naturalWidth, naturalHeight, name }) => {
      const id = uid();
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clip: ImageClip = {
          ...baseClip(MEDIA_TRACK, Math.round(s.currentFrame), 90, "image", name),
          id,
          kind: "image",
          src,
          naturalWidth,
          naturalHeight,
        };
        project.clips.push(clip);
        project.durationInFrames = recalcDuration(project);
        return { project, selectedClipId: id };
      });
    },

    addAudioClip: ({ src, durationInFrames, name }) => {
      const id = uid();
      set((s) => {
        const project = structuredCloneProject(s.project);
        const clip: AudioClip = {
          ...baseClip(AUDIO_TRACK, Math.round(s.currentFrame), durationInFrames, "audio", name),
          id,
          kind: "audio",
          src,
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
          ...baseClip(MEDIA_TRACK, Math.round(s.currentFrame), 90, "text", "텍스트"),
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
          ...baseClip(MEDIA_TRACK, Math.round(s.currentFrame), 90, "shape", "도형"),
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

    removeClip: (id) =>
      set((s) => {
        const project = structuredCloneProject(s.project);
        project.clips = project.clips.filter((c) => c.id !== id);
        project.durationInFrames = recalcDuration(project);
        return { project, selectedClipId: s.selectedClipId === id ? null : s.selectedClipId };
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
          (right as VideoClip | AudioClip).trimStart = (c as VideoClip | AudioClip).trimStart + local;
        }
        c.duration = local;
        project.clips.splice(idx + 1, 0, right);
        project.durationInFrames = recalcDuration(project);
        return { project };
      });
      return didSplit ? rightId : null;
    },

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
        c.animations.push({ id: uid(), type, params: { ...defaultParamsFor(def.params), ...paramOverrides } });
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
        const def = filterEffectRegistry[type] ?? regionEffectRegistry[type];
        if (!def) return;
        c.effects.push({ id: uid(), type, params: defaultParamsFor(def.params), region: region ?? null });
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
  };
});

// structuredClone fails on nothing here (all plain data), but keep a helper for clarity.
function structuredCloneProject(p: Project): Project {
  return structuredClone(p);
}

export const selectedClip = (s: State): Clip | null =>
  s.project.clips.find((c) => c.id === s.selectedClipId) ?? null;

// Dev-only hook so the store can be driven from the browser console / e2e checks.
if (import.meta.env.DEV) {
  (window as unknown as { __editorStore?: typeof useStore }).__editorStore = useStore;
}
