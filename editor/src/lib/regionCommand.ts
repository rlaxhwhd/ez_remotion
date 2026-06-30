import { regionEffectRegistry } from "../remotion/effects";

// Map free-text (Korean/English) commands to a region-effect type.
const keywordMap: { keys: string[]; type: string }[] = [
  { keys: ["줌", "확대", "zoom"], type: "zoomToRegion" },
  { keys: ["블러", "흐림", "blur"], type: "regionBlur" },
  { keys: ["모자이크", "mosaic", "pixel"], type: "mosaic" },
  { keys: ["스포트라이트", "주목", "spotlight", "어둡"], type: "spotlight" },
  { keys: ["강조", "하이라이트", "박스", "highlight"], type: "highlight" },
  { keys: ["밝", "bright"], type: "regionBrighten" },
  { keys: ["흑백", "그레이", "gray", "grey"], type: "regionGrayscale" },
  { keys: ["비네트", "vignette"], type: "regionVignette" },
  { keys: ["글로우", "발광", "glow"], type: "regionGlow" },
  { keys: ["대비", "contrast"], type: "regionContrast" },
  { keys: ["채도", "saturat"], type: "regionSaturate" },
  { keys: ["색조", "hue"], type: "regionHue" },
  { keys: ["반전", "invert"], type: "regionInvert" },
  { keys: ["스캔", "scanline", "scan"], type: "regionScanlines" },
  { keys: ["색", "틴트", "tint", "color"], type: "regionTint" },
];

export const parseRegionCommand = (text: string): string | null => {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  for (const { keys, type } of keywordMap) {
    if (keys.some((k) => t.includes(k.toLowerCase()))) return type;
  }
  // direct type name match
  if (t in regionEffectRegistry) return t;
  return null;
};
