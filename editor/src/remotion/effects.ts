import type { CSSProperties } from "react";
import type { ParamValue, Rect } from "../types";
import type { ParamSpec } from "./animations";

import { blur } from "@remotion/effects/blur";
import { pixelate } from "@remotion/effects/pixelate";
import { vignette } from "@remotion/effects/vignette";
import { glow } from "@remotion/effects/glow";
import { chromaticAberration } from "@remotion/effects/chromatic-aberration";
import { grayscale } from "@remotion/effects/grayscale";
import { brightness } from "@remotion/effects/brightness";
import { contrast } from "@remotion/effects/contrast";
import { saturation } from "@remotion/effects/saturation";
import { hue } from "@remotion/effects/hue";
import { invert } from "@remotion/effects/invert";
import { scanlines } from "@remotion/effects/scanlines";

const n = (p: Record<string, ParamValue>, k: string, d: number) =>
  typeof p[k] === "number" ? (p[k] as number) : d;
const s = (p: Record<string, ParamValue>, k: string, d: string) =>
  typeof p[k] === "string" ? (p[k] as string) : d;

// ── Full-frame WebGL effects (the @remotion/effects library) ────────────────
// `build` returns an effect for the `effects` prop of canvas components.
export type FilterEffectDef = {
  mode: "filter";
  type: string;
  label: string;
  params: ParamSpec[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  build: (params: Record<string, ParamValue>) => any;
};

export const filterEffectRegistry: Record<string, FilterEffectDef> = {
  blur: {
    mode: "filter",
    type: "blur",
    label: "블러",
    params: [{ key: "radius", label: "반경", type: "number", default: 8, min: 0, max: 60, step: 1 }],
    build: (p) => blur({ radius: n(p, "radius", 8) }),
  },
  pixelate: {
    mode: "filter",
    type: "pixelate",
    label: "픽셀화",
    params: [{ key: "blockSize", label: "블록 크기", type: "number", default: 12, min: 1, max: 80, step: 1 }],
    build: (p) => pixelate({ blockSize: n(p, "blockSize", 12) }),
  },
  vignette: {
    mode: "filter",
    type: "vignette",
    label: "비네트",
    params: [
      { key: "amount", label: "강도", type: "number", default: 0.6, min: 0, max: 1, step: 0.05 },
      { key: "radius", label: "반경", type: "number", default: 0.8, min: 0, max: 1.5, step: 0.05 },
    ],
    build: (p) => vignette({ amount: n(p, "amount", 0.6), radius: n(p, "radius", 0.8) }),
  },
  glow: {
    mode: "filter",
    type: "glow",
    label: "글로우",
    params: [
      { key: "intensity", label: "강도", type: "number", default: 1, min: 0, max: 4, step: 0.1 },
      { key: "radius", label: "반경", type: "number", default: 10, min: 0, max: 60, step: 1 },
      { key: "threshold", label: "임계값", type: "number", default: 0.5, min: 0, max: 1, step: 0.05 },
    ],
    build: (p) => glow({ intensity: n(p, "intensity", 1), radius: n(p, "radius", 10), threshold: n(p, "threshold", 0.5) }),
  },
  chromaticAberration: {
    mode: "filter",
    type: "chromaticAberration",
    label: "색수차",
    params: [
      { key: "amount", label: "강도", type: "number", default: 8, min: 0, max: 40, step: 1 },
      { key: "angle", label: "각도", type: "number", default: 0, min: 0, max: 360, step: 5 },
    ],
    build: (p) => chromaticAberration({ amount: n(p, "amount", 8), angle: n(p, "angle", 0) }),
  },
  grayscale: {
    mode: "filter",
    type: "grayscale",
    label: "흑백",
    params: [{ key: "amount", label: "강도", type: "number", default: 1, min: 0, max: 1, step: 0.05 }],
    build: (p) => grayscale({ amount: n(p, "amount", 1) }),
  },
  brightness: {
    mode: "filter",
    type: "brightness",
    label: "밝기",
    params: [{ key: "amount", label: "값", type: "number", default: 1.2, min: 0, max: 3, step: 0.05 }],
    build: (p) => brightness({ amount: n(p, "amount", 1.2) }),
  },
  contrast: {
    mode: "filter",
    type: "contrast",
    label: "대비",
    params: [{ key: "amount", label: "값", type: "number", default: 1.3, min: 0, max: 3, step: 0.05 }],
    build: (p) => contrast({ amount: n(p, "amount", 1.3) }),
  },
  saturation: {
    mode: "filter",
    type: "saturation",
    label: "채도",
    params: [{ key: "amount", label: "값", type: "number", default: 1.4, min: 0, max: 3, step: 0.05 }],
    build: (p) => saturation({ amount: n(p, "amount", 1.4) }),
  },
  hue: {
    mode: "filter",
    type: "hue",
    label: "색조 회전",
    params: [{ key: "degrees", label: "각도", type: "number", default: 90, min: 0, max: 360, step: 5 }],
    build: (p) => hue({ degrees: n(p, "degrees", 90) }),
  },
  invert: {
    mode: "filter",
    type: "invert",
    label: "색 반전",
    params: [{ key: "amount", label: "강도", type: "number", default: 1, min: 0, max: 1, step: 0.05 }],
    build: (p) => invert({ amount: n(p, "amount", 1) }),
  },
  scanlines: {
    mode: "filter",
    type: "scanlines",
    label: "스캔라인",
    params: [{ key: "amount", label: "강도", type: "number", default: 0.5, min: 0, max: 1, step: 0.05 }],
    build: (p) => scanlines({ amount: n(p, "amount", 0.5) }),
  },
};

// ── Region effects (selection-area tool) ────────────────────────────────────
// Rendered as CSS overlay layers masked to a rectangle. `reframe` returns a
// transform that reframes the whole clip onto the region (zoom-to-region).
export type RegionEffectDef = {
  mode: "region" | "reframe";
  type: string;
  label: string;
  params: ParamSpec[];
  // CSS for an absolutely-positioned overlay covering the region rect (in px).
  layerStyle?: (params: Record<string, ParamValue>, rectPx: { left: number; top: number; width: number; height: number }, comp: { width: number; height: number }) => CSSProperties;
  // For reframe effects: returns extra transform applied to the whole clip.
  reframe?: (rect: Rect, comp: { width: number; height: number }) => { x: number; y: number; scale: number };
};

export const regionEffectRegistry: Record<string, RegionEffectDef> = {
  regionBlur: {
    mode: "region",
    type: "regionBlur",
    label: "영역 블러",
    params: [{ key: "radius", label: "반경", type: "number", default: 12, min: 1, max: 60, step: 1 }],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backdropFilter: `blur(${n(p, "radius", 12)}px)`,
      WebkitBackdropFilter: `blur(${n(p, "radius", 12)}px)`,
    }),
  },
  mosaic: {
    mode: "region",
    type: "mosaic",
    label: "모자이크",
    params: [{ key: "strength", label: "강도", type: "number", default: 10, min: 2, max: 40, step: 1 }],
    layerStyle: (p, r) => {
      const v = n(p, "strength", 10);
      return {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        backdropFilter: `blur(${v}px) contrast(1.4) brightness(1.05)`,
        WebkitBackdropFilter: `blur(${v}px) contrast(1.4) brightness(1.05)`,
      };
    },
  },
  spotlight: {
    mode: "region",
    type: "spotlight",
    label: "스포트라이트(주변 어둡게)",
    params: [
      { key: "darkness", label: "어둠 정도", type: "number", default: 0.65, min: 0, max: 1, step: 0.05 },
      { key: "feather", label: "부드러움(px)", type: "number", default: 40, min: 0, max: 200, step: 5 },
    ],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      borderRadius: 8,
      boxShadow: `0 0 0 99999px rgba(0,0,0,${n(p, "darkness", 0.65)})`,
      filter: `blur(${n(p, "feather", 40) / 12}px)`,
    }),
  },
  highlight: {
    mode: "region",
    type: "highlight",
    label: "강조 박스",
    params: [
      { key: "color", label: "색상", type: "color", default: "#ffd400" },
      { key: "thickness", label: "두께(px)", type: "number", default: 6, min: 1, max: 30, step: 1 },
    ],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      border: `${n(p, "thickness", 6)}px solid ${s(p, "color", "#ffd400")}`,
      borderRadius: 8,
      boxShadow: `0 0 18px ${s(p, "color", "#ffd400")}`,
    }),
  },
  regionBrighten: {
    mode: "region",
    type: "regionBrighten",
    label: "영역 밝게",
    params: [{ key: "amount", label: "밝기", type: "number", default: 1.5, min: 1, max: 3, step: 0.05 }],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backdropFilter: `brightness(${n(p, "amount", 1.5)})`,
      WebkitBackdropFilter: `brightness(${n(p, "amount", 1.5)})`,
    }),
  },
  regionGrayscale: {
    mode: "region",
    type: "regionGrayscale",
    label: "영역 흑백",
    params: [{ key: "amount", label: "강도", type: "number", default: 1, min: 0, max: 1, step: 0.05 }],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backdropFilter: `grayscale(${n(p, "amount", 1)})`,
      WebkitBackdropFilter: `grayscale(${n(p, "amount", 1)})`,
    }),
  },
  regionTint: {
    mode: "region",
    type: "regionTint",
    label: "영역 색 입히기",
    params: [
      { key: "color", label: "색상", type: "color", default: "#3b82f6" },
      { key: "opacity", label: "투명도", type: "number", default: 0.4, min: 0, max: 1, step: 0.05 },
    ],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      background: s(p, "color", "#3b82f6"),
      opacity: n(p, "opacity", 0.4),
      mixBlendMode: "multiply",
    }),
  },
  regionContrast: {
    mode: "region",
    type: "regionContrast",
    label: "영역 대비",
    params: [{ key: "amount", label: "값", type: "number", default: 1.4, min: 0, max: 3, step: 0.05 }],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backdropFilter: `contrast(${n(p, "amount", 1.4)})`,
      WebkitBackdropFilter: `contrast(${n(p, "amount", 1.4)})`,
    }),
  },
  regionSaturate: {
    mode: "region",
    type: "regionSaturate",
    label: "영역 채도",
    params: [{ key: "amount", label: "값", type: "number", default: 1.6, min: 0, max: 3, step: 0.05 }],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backdropFilter: `saturate(${n(p, "amount", 1.6)})`,
      WebkitBackdropFilter: `saturate(${n(p, "amount", 1.6)})`,
    }),
  },
  regionHue: {
    mode: "region",
    type: "regionHue",
    label: "영역 색조 회전",
    params: [{ key: "degrees", label: "각도", type: "number", default: 90, min: 0, max: 360, step: 5 }],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backdropFilter: `hue-rotate(${n(p, "degrees", 90)}deg)`,
      WebkitBackdropFilter: `hue-rotate(${n(p, "degrees", 90)}deg)`,
    }),
  },
  regionInvert: {
    mode: "region",
    type: "regionInvert",
    label: "영역 색 반전",
    params: [{ key: "amount", label: "강도", type: "number", default: 1, min: 0, max: 1, step: 0.05 }],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backdropFilter: `invert(${n(p, "amount", 1)})`,
      WebkitBackdropFilter: `invert(${n(p, "amount", 1)})`,
    }),
  },
  regionVignette: {
    mode: "region",
    type: "regionVignette",
    label: "영역 비네트",
    params: [
      { key: "amount", label: "강도", type: "number", default: 0.6, min: 0, max: 1, step: 0.05 },
      { key: "radius", label: "범위", type: "number", default: 0.4, min: 0, max: 1, step: 0.05 },
    ],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0) ${n(p, "radius", 0.4) * 100}%, rgba(0,0,0,${n(p, "amount", 0.6)}) 100%)`,
    }),
  },
  regionScanlines: {
    mode: "region",
    type: "regionScanlines",
    label: "영역 스캔라인",
    params: [{ key: "amount", label: "강도", type: "number", default: 0.5, min: 0, max: 1, step: 0.05 }],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      background: `repeating-linear-gradient(0deg, rgba(0,0,0,${n(p, "amount", 0.5)}) 0px, rgba(0,0,0,${n(p, "amount", 0.5)}) 1px, transparent 1px, transparent 3px)`,
    }),
  },
  regionGlow: {
    mode: "region",
    type: "regionGlow",
    label: "영역 글로우",
    params: [
      { key: "intensity", label: "강도", type: "number", default: 1.2, min: 0, max: 3, step: 0.1 },
      { key: "radius", label: "반경", type: "number", default: 8, min: 0, max: 40, step: 1 },
    ],
    layerStyle: (p, r) => ({
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backdropFilter: `blur(${n(p, "radius", 8)}px) brightness(${1 + n(p, "intensity", 1.2)})`,
      WebkitBackdropFilter: `blur(${n(p, "radius", 8)}px) brightness(${1 + n(p, "intensity", 1.2)})`,
      mixBlendMode: "screen",
    }),
  },
  zoomToRegion: {
    mode: "reframe",
    type: "zoomToRegion",
    label: "영역으로 줌(연출)",
    params: [],
    reframe: (rect, comp) => {
      // Scale so the selected rect fills the frame, then translate its centre to the centre.
      const scale = Math.min(1 / Math.max(rect.width, 0.001), 1 / Math.max(rect.height, 0.001));
      const cx = (rect.x + rect.width / 2) * comp.width;
      const cy = (rect.y + rect.height / 2) * comp.height;
      const x = (comp.width / 2 - cx) * scale;
      const y = (comp.height / 2 - cy) * scale;
      return { x, y, scale };
    },
  },
};

export const filterEffectList = Object.values(filterEffectRegistry);
export const regionEffectList = Object.values(regionEffectRegistry);

export const isRegionType = (type: string) => type in regionEffectRegistry;
export const isFilterType = (type: string) => type in filterEffectRegistry;
