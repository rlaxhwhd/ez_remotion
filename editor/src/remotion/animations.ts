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
  zoomPop: {
    type: "zoomPop",
    label: "영역 줌아웃 (자동 삽입)",
    category: "emphasis",
    params: [
      { key: "to", label: "배율", type: "number", default: 2, min: 1.1, max: 4, step: 0.05 },
      { key: "toX", label: "X 이동(px)", type: "number", default: 0, min: -2000, max: 2000, step: 1 },
      { key: "toY", label: "Y 이동(px)", type: "number", default: 0, min: -2000, max: 2000, step: 1 },
      { key: "duration", label: "줌아웃 길이(초)", type: "number", default: 1.0, min: 0.2, max: 5, step: 0.1 },
    ],
    // Mirror of zoomPush: starts at the zoomed-in framing (to / toX / toY) and
    // eases back to the normal full-frame view. Pair it at the clip tail to undo
    // an area zoom-in with the exact same region and strength.
    apply: ({ frame, fps, params }) => {
      const to = num(params, "to", 2);
      const toX = num(params, "toX", 0);
      const toY = num(params, "toY", 0);
      const endFrame = Math.max(1, num(params, "duration", 1.0) * fps);
      const ease = Easing.bezier(0.16, 1, 0.3, 1);
      const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: ease };
      return {
        scale: interpolate(frame, [0, endFrame], [to, 1], opts),
        translateX: interpolate(frame, [0, endFrame], [toX, 0], opts),
        translateY: interpolate(frame, [0, endFrame], [toY, 0], opts),
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

  // ── 추가 IN ────────────────────────────────────────────────────────────────
  slamIn: {
    type: "slamIn",
    label: "슬램 인 (쾅 박히기)",
    category: "in",
    params: [
      { key: "startScale", label: "시작 배율", type: "number", default: 1.8, min: 1.1, max: 5, step: 0.1 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.2, min: 0.05, max: 3, step: 0.05 },
    ],
    apply: ({ frame, fps, params }) => {
      const d = Math.max(1, num(params, "duration", 0.2) * fps);
      const ease = Easing.bezier(0.16, 1, 0.3, 1);
      return {
        scale: interpolate(frame, [0, d], [num(params, "startScale", 1.8), 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }),
        opacity: interpolate(frame, [0, Math.max(1, d * 0.3)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  dropIn: {
    type: "dropIn",
    label: "드롭 인 (위에서 떨어지기)",
    category: "in",
    params: [
      { key: "distance", label: "거리(px)", type: "number", default: 500, min: 50, max: 2000, step: 10 },
      { key: "damping", label: "댐핑(탄성)", type: "number", default: 10, min: 1, max: 30, step: 1 },
    ],
    apply: ({ frame, fps, params }) => {
      const s = spring({ frame, fps, config: { damping: num(params, "damping", 10), mass: 0.6 } });
      return {
        translateY: interpolate(s, [0, 1], [-num(params, "distance", 500), 0]),
        opacity: interpolate(frame, [0, Math.max(1, fps * 0.1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  bounceIn: {
    type: "bounceIn",
    label: "바운스 인 (아래서 튀어오르기)",
    category: "in",
    params: [
      { key: "distance", label: "거리(px)", type: "number", default: 400, min: 50, max: 2000, step: 10 },
      { key: "damping", label: "댐핑(탄성)", type: "number", default: 8, min: 1, max: 30, step: 1 },
    ],
    apply: ({ frame, fps, params }) => {
      const s = spring({ frame, fps, config: { damping: num(params, "damping", 8), mass: 0.6 } });
      return {
        translateY: interpolate(s, [0, 1], [num(params, "distance", 400), 0]),
        opacity: interpolate(frame, [0, Math.max(1, fps * 0.1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  blurIn: {
    type: "blurIn",
    label: "블러 인 (흐림→선명)",
    category: "in",
    params: [
      { key: "amount", label: "블러(px)", type: "number", default: 20, min: 1, max: 80, step: 1 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.7, min: 0.1, max: 3, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const d = Math.max(1, num(params, "duration", 0.7) * fps);
      const ease = Easing.bezier(0.16, 1, 0.3, 1);
      const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: ease };
      return {
        blur: interpolate(frame, [0, d], [num(params, "amount", 20), 0], opts),
        opacity: interpolate(frame, [0, Math.max(1, d * 0.5)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  rollIn: {
    type: "rollIn",
    label: "롤 인 (굴러서 등장)",
    category: "in",
    params: [
      { key: "direction", label: "방향", type: "select", default: "left", options: directionOptions },
      { key: "distance", label: "거리(px)", type: "number", default: 600, min: 50, max: 2000, step: 10 },
      { key: "damping", label: "댐핑", type: "number", default: 14, min: 1, max: 30, step: 1 },
    ],
    apply: ({ frame, fps, params }) => {
      const s = spring({ frame, fps, config: { damping: num(params, "damping", 14) } });
      const [dx, dy] = dirOffset(str(params, "direction", "left"), num(params, "distance", 600));
      return {
        translateX: interpolate(s, [0, 1], [dx, 0]),
        translateY: interpolate(s, [0, 1], [dy, 0]),
        rotate: interpolate(s, [0, 1], [-360, 0]),
        opacity: interpolate(frame, [0, Math.max(1, fps * 0.1)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  zoomFadeIn: {
    type: "zoomFadeIn",
    label: "줌 페이드 인",
    category: "in",
    params: [
      { key: "fromScale", label: "시작 배율", type: "number", default: 0.3, min: 0.05, max: 0.95, step: 0.05 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.6, min: 0.1, max: 3, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const d = Math.max(1, num(params, "duration", 0.6) * fps);
      const ease = Easing.bezier(0.16, 1, 0.3, 1);
      const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: ease };
      return {
        scale: interpolate(frame, [0, d], [num(params, "fromScale", 0.3), 1], opts),
        opacity: interpolate(frame, [0, d], [0, 1], opts),
      };
    },
  },
  swingIn: {
    type: "swingIn",
    label: "스윙 인 (진자 등장)",
    category: "in",
    params: [
      { key: "angle", label: "시작 각도", type: "number", default: 60, min: 10, max: 180, step: 5 },
      { key: "damping", label: "댐핑", type: "number", default: 6, min: 1, max: 20, step: 1 },
    ],
    apply: ({ frame, fps, params }) => {
      const s = spring({ frame, fps, config: { damping: num(params, "damping", 6) } });
      return {
        rotate: interpolate(s, [0, 1], [num(params, "angle", 60), 0]),
        opacity: interpolate(frame, [0, Math.max(1, fps * 0.15)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },

  // ── 추가 OUT ───────────────────────────────────────────────────────────────
  slamOut: {
    type: "slamOut",
    label: "슬램 아웃 (쾅 사라지기)",
    category: "out",
    params: [
      { key: "endScale", label: "끝 배율", type: "number", default: 1.8, min: 1.1, max: 5, step: 0.1 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.2, min: 0.05, max: 1, step: 0.05 },
    ],
    apply: ({ frame, durationInFrames, fps, params }) => {
      const d = Math.max(1, num(params, "duration", 0.2) * fps);
      const startF = durationInFrames - d;
      const ease = Easing.bezier(0.4, 0, 1, 1);
      return {
        scale: interpolate(frame, [startF, durationInFrames], [1, num(params, "endScale", 1.8)], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease }),
        opacity: interpolate(frame, [Math.max(0, startF + d * 0.5), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  dropOut: {
    type: "dropOut",
    label: "드롭 아웃 (아래로 떨어지기)",
    category: "out",
    params: [
      { key: "distance", label: "거리(px)", type: "number", default: 500, min: 50, max: 2000, step: 10 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.5, min: 0.1, max: 2, step: 0.1 },
    ],
    apply: ({ frame, durationInFrames, fps, params }) => {
      const d = Math.max(1, num(params, "duration", 0.5) * fps);
      const startF = durationInFrames - d;
      const ease = Easing.bezier(0.4, 0, 1, 1);
      const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: ease };
      return {
        translateY: interpolate(frame, [startF, durationInFrames], [0, num(params, "distance", 500)], opts),
        opacity: interpolate(frame, [startF, durationInFrames], [1, 0], opts),
      };
    },
  },
  blurOut: {
    type: "blurOut",
    label: "블러 아웃 (선명→흐림)",
    category: "out",
    params: [
      { key: "amount", label: "블러(px)", type: "number", default: 20, min: 1, max: 80, step: 1 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.7, min: 0.1, max: 3, step: 0.1 },
    ],
    apply: ({ frame, durationInFrames, fps, params }) => {
      const d = Math.max(1, num(params, "duration", 0.7) * fps);
      const startF = durationInFrames - d;
      const ease = Easing.bezier(0.4, 0, 1, 1);
      const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: ease };
      return {
        blur: interpolate(frame, [startF, durationInFrames], [0, num(params, "amount", 20)], opts),
        opacity: interpolate(frame, [Math.max(0, startF + d * 0.4), durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  rollOut: {
    type: "rollOut",
    label: "롤 아웃 (굴러서 퇴장)",
    category: "out",
    params: [
      { key: "direction", label: "방향", type: "select", default: "right", options: directionOptions },
      { key: "distance", label: "거리(px)", type: "number", default: 600, min: 50, max: 2000, step: 10 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.6, min: 0.1, max: 2, step: 0.1 },
    ],
    apply: ({ frame, durationInFrames, fps, params }) => {
      const d = Math.max(1, num(params, "duration", 0.6) * fps);
      const startF = durationInFrames - d;
      const [dx, dy] = dirOffset(str(params, "direction", "right"), num(params, "distance", 600));
      const ease = Easing.bezier(0.4, 0, 1, 1);
      const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: ease };
      return {
        translateX: interpolate(frame, [startF, durationInFrames], [0, dx], opts),
        translateY: interpolate(frame, [startF, durationInFrames], [0, dy], opts),
        rotate: interpolate(frame, [startF, durationInFrames], [0, 360], opts),
      };
    },
  },
  zoomFadeOut: {
    type: "zoomFadeOut",
    label: "줌 페이드 아웃",
    category: "out",
    params: [
      { key: "toScale", label: "끝 배율", type: "number", default: 0.3, min: 0.05, max: 0.95, step: 0.05 },
      { key: "duration", label: "길이(초)", type: "number", default: 0.6, min: 0.1, max: 3, step: 0.1 },
    ],
    apply: ({ frame, durationInFrames, fps, params }) => {
      const d = Math.max(1, num(params, "duration", 0.6) * fps);
      const startF = durationInFrames - d;
      const ease = Easing.bezier(0.4, 0, 1, 1);
      const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: ease };
      return {
        scale: interpolate(frame, [startF, durationInFrames], [1, num(params, "toScale", 0.3)], opts),
        opacity: interpolate(frame, [startF, durationInFrames], [1, 0], opts),
      };
    },
  },

  // ── 추가 Emphasis ──────────────────────────────────────────────────────────
  shake: {
    type: "shake",
    label: "좌우 진동 (Shake)",
    category: "emphasis",
    params: [
      { key: "amount", label: "거리(px)", type: "number", default: 15, min: 1, max: 100, step: 1 },
      { key: "speed", label: "속도", type: "number", default: 8, min: 1, max: 30, step: 1 },
    ],
    apply: ({ frame, fps, params }) => {
      const t = (frame / fps) * num(params, "speed", 8) * Math.PI * 2;
      return { translateX: Math.sin(t) * num(params, "amount", 15) };
    },
  },
  flash: {
    type: "flash",
    label: "깜빡이기 (Flash)",
    category: "emphasis",
    params: [
      { key: "speed", label: "속도(Hz)", type: "number", default: 4, min: 0.5, max: 20, step: 0.5 },
      { key: "minOpacity", label: "최소 불투명도", type: "number", default: 0, min: 0, max: 0.9, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const t = (frame / fps) * num(params, "speed", 4) * Math.PI;
      const minOp = num(params, "minOpacity", 0);
      return { opacity: interpolate(Math.abs(Math.sin(t)), [0, 1], [minOp, 1]) };
    },
  },
  breathe: {
    type: "breathe",
    label: "숨쉬기 (Breathe)",
    category: "emphasis",
    params: [
      { key: "amount", label: "크기 변화", type: "number", default: 0.06, min: 0.01, max: 0.3, step: 0.01 },
      { key: "speed", label: "속도(회/초)", type: "number", default: 0.4, min: 0.1, max: 3, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const t = (frame / fps) * num(params, "speed", 0.4) * Math.PI * 2;
      return { scale: 1 + Math.sin(t) * num(params, "amount", 0.06) };
    },
  },
  heartbeat: {
    type: "heartbeat",
    label: "심장박동 (Heartbeat)",
    category: "emphasis",
    params: [
      { key: "amount", label: "크기 변화", type: "number", default: 0.3, min: 0.05, max: 1, step: 0.05 },
      { key: "speed", label: "박자(회/초)", type: "number", default: 1.2, min: 0.2, max: 4, step: 0.1 },
    ],
    apply: ({ frame, fps, params }) => {
      const t = ((frame / fps) * num(params, "speed", 1.2)) % 1;
      const a = num(params, "amount", 0.3);
      return {
        scale: interpolate(t, [0, 0.12, 0.22, 0.32, 0.48, 1], [1, 1 + a, 1 + a * 0.3, 1 + a * 0.7, 1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      };
    },
  },
  glitch: {
    type: "glitch",
    label: "글리치 (Glitch)",
    category: "emphasis",
    params: [
      { key: "amount", label: "이동 거리(px)", type: "number", default: 20, min: 1, max: 100, step: 1 },
      { key: "speed", label: "속도", type: "number", default: 12, min: 1, max: 40, step: 1 },
    ],
    apply: ({ frame, fps, params }) => {
      const a = num(params, "amount", 20);
      const sp = num(params, "speed", 12);
      const t1 = (frame / fps) * sp;
      const t2 = (frame / fps) * sp * 1.7;
      const t3 = (frame / fps) * sp * 2.3;
      return {
        translateX: Math.sin(t1 * Math.PI * 2) * a * 0.5 + Math.sin(t2 * Math.PI * 2) * a * 0.3,
        translateY: Math.sin(t3 * Math.PI * 2) * a * 0.2,
        opacity: Math.sin(frame * 1.3) > 0.6 ? 0.6 : 1,
      };
    },
  },
};

export const animationList = Object.values(animationRegistry);

export const composeAnimations = (
  // each animation carries its own frame + duration so it can be timed
  // independently of the clip (frame is relative to the animation's own start)
  defs: { type: string; params: Record<string, ParamValue>; frame: number; durationInFrames: number }[],
  fps: number,
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
    const s = def.apply({ frame: a.frame, durationInFrames: a.durationInFrames, fps, params: a.params });
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
