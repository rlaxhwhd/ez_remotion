// ───────────────────────────────────────────────────────────────────────────
// Core data model for the editor. Everything the user builds is serialised here
// and the dynamic Remotion composition renders directly from this state.
// ───────────────────────────────────────────────────────────────────────────

export type Rect = {
  // Normalised 0..1 coordinates relative to the composition frame.
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Transform = {
  x: number; // px offset from centre
  y: number;
  scale: number;
  rotation: number; // degrees
  opacity: number; // 0..1
};

export type ParamValue = number | string | boolean;

// An applied animation (entrance/emphasis/exit). `type` keys into animationRegistry.
// `start`/`duration` are absolute timeline frames so the animation can be timed
// independently of its parent clip. When undefined, it spans the whole clip.
export type AnimationInstance = {
  id: string;
  type: string;
  params: Record<string, ParamValue>;
  start?: number;
  duration?: number;
};

// An applied visual effect. `type` keys into effectRegistry.
// When `region` is set, the effect is masked to that rectangle (selection tool).
// `start`/`duration` (absolute timeline frames) time it independently of the clip.
export type EffectInstance = {
  id: string;
  type: string;
  params: Record<string, ParamValue>;
  region?: Rect | null;
  start?: number;
  duration?: number;
};

export type TransitionKind = "none" | "fade" | "slide" | "wipe" | "flip" | "clockWipe";

export type ClipKind = "video" | "image" | "text" | "shape" | "audio";

type ClipBase = {
  id: string;
  trackId: string;
  kind: ClipKind;
  name: string;
  start: number; // timeline frame at which the clip starts
  duration: number; // length on the timeline, in frames
  transform: Transform;
  animations: AnimationInstance[];
  effects: EffectInstance[];
  // Transition played at the START of this clip, overlapping the previous clip.
  transitionIn: { kind: TransitionKind; durationInFrames: number };
};

export type VideoClip = ClipBase & {
  kind: "video";
  src: string;
  assetId?: string; // IndexedDB key for the uploaded file (for reload persistence)
  naturalWidth: number;
  naturalHeight: number;
  naturalDurationInFrames: number;
  trimStart: number; // in-point inside the source, in frames
  volume: number; // 0..1
  playbackRate: number;
  muted: boolean;
};

export type ImageClip = ClipBase & {
  kind: "image";
  src: string;
  assetId?: string;
  naturalWidth: number;
  naturalHeight: number;
};

export type TextStyle = "none" | "neon" | "glitch" | "3d" | "metal" | "outline";

export type TextClip = ClipBase & {
  kind: "text";
  text: string;
  fontSize: number;
  color: string;
  fontWeight: number;
  fontFamily: string;
  align: "left" | "center" | "right";
  background: string; // "transparent" or rgba
  textStyle?: TextStyle; // CSS look preset (neon/glitch/3d/metal/outline)
  styleColor?: string; // accent colour for the preset (glow/stroke/gradient)
  curve?: number; // -1..1 arch curvature; 0 = straight (SVG textPath)
  karaoke?: boolean; // sweep a highlight colour across the text over time
  karaokeColor?: string;
};

export type ShapeClip = ClipBase & {
  kind: "shape";
  shape: "rect" | "circle" | "triangle" | "star" | "ellipse";
  fill: string;
  width: number;
  height: number;
  cornerRadius: number;
};

export type AudioClip = ClipBase & {
  kind: "audio";
  src: string;
  assetId?: string;
  naturalDurationInFrames: number;
  trimStart: number;
  volume: number;
  muted: boolean;
};

export type Clip = VideoClip | ImageClip | TextClip | ShapeClip | AudioClip;

export type Track = {
  id: string;
  name: string;
  kind: "media" | "audio";
  hidden: boolean;
  muted: boolean;
};

export type Project = {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  background: string;
  tracks: Track[];
  clips: Clip[];
};

export const defaultTransform = (): Transform => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  opacity: 1,
});
