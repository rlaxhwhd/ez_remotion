import React from "react";
import {
  AbsoluteFill,
  CanvasImage,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
} from "remotion";
import { Video } from "@remotion/media";
import { Rect as ShapeRect, Circle, Triangle, Star, Ellipse } from "@remotion/shapes";
import type { Clip } from "../types";
import { composeAnimations } from "./animations";
import { regionEffectRegistry, filterEffectRegistry } from "./effects";

const transitionStyle = (
  kind: string,
  frame: number,
  d: number,
  width: number,
): { opacity: number; extraTransform: string; clipPath?: string } => {
  if (kind === "none" || d <= 0) return { opacity: 1, extraTransform: "" };
  const p = interpolate(frame, [0, d], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  switch (kind) {
    case "fade":
      return { opacity: p, extraTransform: "" };
    case "slide":
      return { opacity: 1, extraTransform: `translateX(${(1 - p) * -width}px)` };
    case "flip":
      return { opacity: p, extraTransform: `perspective(1200px) rotateY(${(1 - p) * 90}deg)` };
    case "wipe":
      return { opacity: 1, extraTransform: "", clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
    case "clockWipe":
      return { opacity: 1, extraTransform: "", clipPath: `inset(0 0 ${(1 - p) * 100}% 0)` };
    default:
      return { opacity: p, extraTransform: "" };
  }
};

const InnerContent: React.FC<{ clip: Clip }> = ({ clip }) => {
  const { width, height } = useVideoConfig();
  // WebGL filter effects (@remotion/effects) for canvas-based media components.
  const filters =
    clip.kind === "video" || clip.kind === "image"
      ? clip.effects.map((e) => filterEffectRegistry[e.type]?.build(e.params)).filter(Boolean)
      : [];
  switch (clip.kind) {
    case "video":
      return (
        <Video
          src={clip.src}
          trimBefore={clip.trimStart}
          volume={clip.muted ? 0 : clip.volume}
          playbackRate={clip.playbackRate}
          style={{ width: "100%", height: "100%" }}
          objectFit="contain"
          effects={filters}
        />
      );
    case "image":
      return <CanvasImage src={clip.src} width={width} height={height} fit="contain" effects={filters} />;
    case "audio":
      return <Audio src={clip.src} startFrom={clip.trimStart} volume={clip.muted ? 0 : clip.volume} />;
    case "text":
      return (
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems:
              clip.align === "left" ? "flex-start" : clip.align === "right" ? "flex-end" : "center",
            padding: 60,
          }}
        >
          <div
            style={{
              fontSize: clip.fontSize,
              color: clip.color,
              fontWeight: clip.fontWeight,
              fontFamily: clip.fontFamily,
              textAlign: clip.align,
              background: clip.background,
              padding: clip.background === "transparent" ? 0 : "0.2em 0.5em",
              borderRadius: 12,
              whiteSpace: "pre-wrap",
              lineHeight: 1.2,
            }}
          >
            {clip.text}
          </div>
        </AbsoluteFill>
      );
    case "shape": {
      const common = { fill: clip.fill };
      const w = clip.width;
      const h = clip.height;
      let shape: React.ReactNode;
      if (clip.shape === "rect") shape = <ShapeRect width={w} height={h} cornerRadius={clip.cornerRadius} {...common} />;
      else if (clip.shape === "circle") shape = <Circle radius={Math.min(w, h) / 2} {...common} />;
      else if (clip.shape === "ellipse") shape = <Ellipse rx={w / 2} ry={h / 2} {...common} />;
      else if (clip.shape === "triangle") shape = <Triangle length={Math.min(w, h)} direction="up" {...common} />;
      else shape = <Star outerRadius={Math.min(w, h) / 2} innerRadius={Math.min(w, h) / 4} points={5} {...common} />;
      return (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>{shape}</AbsoluteFill>
      );
    }
    default:
      return null;
  }
};

export const ClipRenderer: React.FC<{ clip: Clip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (clip.kind === "audio") {
    // Audio has no visual layer or transform.
    return <InnerContent clip={clip} />;
  }

  const anim = composeAnimations(
    clip.animations.map((a) => ({ type: a.type, params: a.params })),
    { frame, durationInFrames: clip.duration, fps },
  );

  // Reframe (zoom-to-region) effects modify the whole-clip transform.
  let reframeX = 0;
  let reframeY = 0;
  let reframeScale = 1;
  for (const e of clip.effects) {
    const def = regionEffectRegistry[e.type];
    if (def?.mode === "reframe" && def.reframe && e.region) {
      const r = def.reframe(e.region, { width, height });
      reframeX += r.x;
      reframeY += r.y;
      reframeScale *= r.scale;
    }
  }

  const tr = clip.transform;
  const trans = transitionStyle(clip.transitionIn.kind, frame, clip.transitionIn.durationInFrames, width);

  const opacity = tr.opacity * anim.opacity;
  const scale = tr.scale * anim.scale * reframeScale;
  const translateX = tr.x + anim.translateX + reframeX;
  const translateY = tr.y + anim.translateY + reframeY;
  const rotate = tr.rotation + anim.rotate;

  const transform =
    `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotate}deg) ${trans.extraTransform}`.trim();

  // Region overlay layers (selection-area tool, CSS-masked to a rect).
  const regionLayers = clip.effects
    .map((e) => {
      const def = regionEffectRegistry[e.type];
      if (!def || def.mode !== "region" || !def.layerStyle || !e.region) return null;
      const rectPx = {
        left: e.region.x * width,
        top: e.region.y * height,
        width: e.region.width * width,
        height: e.region.height * height,
      };
      return (
        <div
          key={e.id}
          style={{ position: "absolute", pointerEvents: "none", ...def.layerStyle(e.params, rectPx, { width, height }) }}
        />
      );
    })
    .filter(Boolean);

  return (
    <AbsoluteFill
      style={{
        opacity: Math.max(0, Math.min(1, opacity)),
        transform,
        transformOrigin: "center center",
        filter: anim.blur ? `blur(${anim.blur}px)` : undefined,
        clipPath: trans.clipPath,
      }}
    >
      <InnerContent clip={clip} />
      {regionLayers}
    </AbsoluteFill>
  );
};
