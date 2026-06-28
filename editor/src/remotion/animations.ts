import { interpolate, spring, Easing } from "remotion";
import type { ParamValue } from "../types";

// Style contribution an animation adds on top of a clip's base transform.
export type AnimStyle = {
  opacity?: number; // multiplied
  scale?: number; // multiplied
  translateX?: number; // added (px)
  translateY?: number; // added (px)
  rotate?: number; // added (deg)
  blur?: number; // added (px)
};

export type ParamSpec = {
  key: string;
  label: string;
  type: "number" | "select" | "color" | "text";
  default: ParamValue;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
};

export type AnimContext = {
  frame: number; // frame relative to clip start
  durationInFrames: number;
  fps: number;
  params: Record<string, ParamValue>;
};

export type AnimationDef = {
  type: string;
  label: string;
  category: "in" | "out" | "emphasis";
  params: ParamSpec[];
  apply: (ctx: AnimContext) => AnimStyle;
};

const num = (p: Record<string, ParamValue>, k: string, d: number) =>
  typeof p[k] === "number" ? (p[k] as number) : d;
const str = (p: Record<string, ParamValue>, k: string, d: string) =>
  typeof p[k] === "string" ? (p[k] as string) : d;

const dirOffset = (direction: string, distance: number): [number, number] => {
  switch (direction) {
    case "left":
      return [-distance, 0];
    case "right":
      return [distance, 0];
    case "up":
      return [0, -distance];
    case "down":
      return [0, distance];
    default:
      return [-distance, 0];
  }
};

const directionOptions = [
  { value: "left", label: "왼쪽" },
  { value: "right", label: "오른쪽" },
  { value: "up", label: "위" },
  { value: "down", label: "아래" },
];

export const animationRegistry: Record<string, AnimationDef> = {
  fadeIn: {
    type: "fadeIn",
    label: "페이드 인",
    category: "in",
    params: [{ key: "duration", label: "길이(초)", type: "number", default: 0.6, min: 0.1, max: 5, step: 0.1 }],
    apply: ({ frame, fps, params }) => {
      const d = num(params, "duration", 0.6) * fps;
      return {
        opacity: interpolate(frame, [0, d], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  fadeOut: {
    type: "fadeOut",
    label: "페이드 아웃",
    category: "out",
    params: [{ key: "duration", label: "길이(초)", type: "number", default: 0.6, min: 0.1, max: 5, step: 0.1 }],
    apply: ({ frame, durationInFrames, fps, params }) => {
      const d = num(params, "duration", 0.6) * fps;
      return {
        opacity: interpolate(frame, [durationInFrames - d, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      };
    },
  },
  slideIn: {
    type: "slideIn",
    label: "슬라이드 인",
    category: "in",
    params: [
      { key: "direction", label: "방향", type: "select", default: "left", options: directionOptions },
      { key: "distance", label: "거리(px)", type: "number", default: 400, min: 10, max: 2000, step: 10 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.7, min: 0.1, max: 5, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const d = num(params, "duration", 0.7) * fps;
      const [dx, dy] = dirOffset(str(params, "direction", "left"), num(params, "distance", 400));
      const p = interpolate(frame, [0, d], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
      return { translateX: dx * p, translateY: dy * p, opacity: interpolate(frame, [0, d], [0, 1], { extrapolateRight: "clamp" }) };
    },
  },
  slideOut: {
    type: "slideOut",
    label: "슬라이드 아웃",
    category: "out",
    params: [
      { key: "direction", label: "방향", type: "select", default: "right", options: directionOptions },
      { key: "distance", label: "거리(px)", type: "number", default: 400, min: 10, max: 2000, step: 10 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.7, min: 0.1, max: 5, step: 0.1 },
    ],
    apply: ({ frame, durationInFrames, fps, params }) => {
      const d = num(params, "duration", 0.7) * fps;
      const [dx, dy] = dirOffset(str(params, "direction", "right"), num(params, "distance", 400));
      const p = interpolate(frame, [durationInFrames - d, durationInFrames], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.7, 0, 0.84, 0),
      });
      return { translateX: dx * p, translateY: dy * p, opacity: 1 - p };
    },
  },
  zoomIn: {
    type: "zoomIn",
    label: "줌 인 (Ken Burns)",
    category: "emphasis",
    params: [
      { key: "from", label: "시작 배율", type: "number", default: 1, min: 0.5, max: 3, step: 0.05 },
      { key: "to", label: "끝 배율", type: "number", default: 1.4, min: 0.5, max: 4, step: 0.05 },
    ],
    apply: ({ frame, durationInFrames, params }) => {
      const from = num(params, "from", 1);
      const to = num(params, "to", 1.4);
      return {
        scale: interpolate(frame, [0, durationInFrames], [from, to], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      };
    },
  },
  zoomPush: {
    type: "zoomPush",
    label: "영역 줌인 (자동 삽입)",
    category: "emphasis",
    params: [
      { key: "to", label: "배율", type: "number", default: 2, min: 1.1, max: 4, step: 0.05 },
      { key: "toX", label: "X 이동(px)", type: "number", default: 0, min: -2000, max: 2000, step: 1 },
      { key: "toY", label: "Y 이동(px)", type: "number", default: 0, min: -2000, max: 2000, step: 1 },
      { key: "duration", label: "줌 길이(초)", type: "number", default: 1.0, min: 0.2, max: 5, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const to = num(params, "to", 2);
      const toX = num(params, "toX", 0);
      const toY = num(params, "toY", 0);
      const endFrame = Math.max(1, num(params, "duration", 1.0) * fps);
      const ease = Easing.bezier(0.16, 1, 0.3, 1);
      const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: ease };
      return {
        scale: interpolate(frame, [0, endFrame], [1, to], opts),
        translateX: interpolate(frame, [0, endFrame], [0, toX], opts),
        translateY: interpolate(frame, [0, endFrame], [0, toY], opts),
      };
    },
  },
  zoomOut: {
    type: "zoomOut",
    label: "줌 아웃 (Ken Burns)",
    category: "emphasis",
    params: [
      { key: "from", label: "시작 배율", type: "number", default: 1.4, min: 0.5, max: 4, step: 0.05 },
      { key: "to", label: "끝 배율", type: "number", default: 1, min: 0.5, max: 3, step: 0.05 },
    ],
    apply: ({ frame, durationInFrames, params }) => {
      const from = num(params, "from", 1.4);
      const to = num(params, "to", 1);
      return {
        scale: interpolate(frame, [0, durationInFrames], [from, to], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      };
    },
  },
  popIn: {
    type: "popIn",
    label: "팝 인 (스프링)",
    category: "in",
    params: [{ key: "damping", label: "댐핑", type: "number", default: 12, min: 1, max: 30, step: 1 }],
    apply: ({ frame, fps, params }) => {
      const s = spring({ frame, fps, config: { damping: num(params, "damping", 12) } });
      return { scale: s, opacity: interpolate(s, [0, 1], [0, 1]) };
    },
  },
  spin: {
    type: "spin",
    label: "회전",
    category: "emphasis",
    params: [{ key: "turns", label: "회전 수", type: "number", default: 1, min: 0.1, max: 10, step: 0.1 }],
    apply: ({ frame, durationInFrames, params }) => ({
      rotate: interpolate(frame, [0, durationInFrames], [0, 360 * num(params, "turns", 1)]),
    }),
  },
  pulse: {
    type: "pulse",
    label: "펄스",
    category: "emphasis",
    params: [
      { key: "amount", label: "강도", type: "number", default: 0.1, min: 0.01, max: 0.5, step: 0.01 },
      { key: "speed", label: "속도", type: "number", default: 2, min: 0.2, max: 10, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const t = (frame / fps) * num(params, "speed", 2) * Math.PI * 2;
      return { scale: 1 + Math.sin(t) * num(params, "amount", 0.1) };
    },
  },
  wiggle: {
    type: "wiggle",
    label: "흔들기",
    category: "emphasis",
    params: [
      { key: "angle", label: "각도", type: "number", default: 6, min: 1, max: 45, step: 1 },
      { key: "speed", label: "속도", type: "number", default: 4, min: 0.2, max: 15, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const t = (frame / fps) * num(params, "speed", 4) * Math.PI * 2;
      return { rotate: Math.sin(t) * num(params, "angle", 6) };
    },
  },
  floatY: {
    type: "floatY",
    label: "둥실 떠오르기",
    category: "emphasis",
    params: [
      { key: "amount", label: "거리(px)", type: "number", default: 20, min: 2, max: 200, step: 2 },
      { key: "speed", label: "속도", type: "number", default: 1, min: 0.1, max: 8, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const t = (frame / fps) * num(params, "speed", 1) * Math.PI * 2;
      return { translateY: Math.sin(t) * num(params, "amount", 20) };
    },
  },
};

export const animationList = Object.values(animationRegistry);

export const composeAnimations = (
  defs: { type: string; params: Record<string, ParamValue> }[],
  ctx: Omit<AnimContext, "params">,
): Required<AnimStyle> => {
  const out: Required<AnimStyle> = {
    opacity: 1,
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotate: 0,
    blur: 0,
  };
  for (const a of defs) {
    const def = animationRegistry[a.type];
    if (!def) continue;
    const s = def.apply({ ...ctx, params: a.params });
    if (s.opacity !== undefined) out.opacity *= s.opacity;
    if (s.scale !== undefined) out.scale *= s.scale;
    if (s.translateX !== undefined) out.translateX += s.translateX;
    if (s.translateY !== undefined) out.translateY += s.translateY;
    if (s.rotate !== undefined) out.rotate += s.rotate;
    if (s.blur !== undefined) out.blur += s.blur;
  }
  return out;
};

export const defaultParamsFor = (specs: ParamSpec[]): Record<string, ParamValue> => {
  const o: Record<string, ParamValue> = {};
  for (const s of specs) o[s.key] = s.default;
  return o;
};
