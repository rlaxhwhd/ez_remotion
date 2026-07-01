import React from "react";
import {
  AbsoluteFill,
  Img,
  Video,
  OffthreadVideo,
  Audio,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Easing,
  getRemotionEnvironment,
} from "remotion";
import { Rect as ShapeRect, Circle, Triangle, Star, Ellipse } from "@remotion/shapes";
import type { Clip } from "../types";
import { composeAnimations, animationRegistry } from "./animations";
import { regionEffectRegistry } from "./effects";
import { TextClipRenderer } from "./TextClipRenderer";

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

// `silent` forces audio off — used by the glow layer (a muted duplicate copy).
const InnerContent: React.FC<{ clip: Clip; silent?: boolean }> = ({ clip, silent }) => {
  switch (clip.kind) {
    case "video": {
      const style: React.CSSProperties = { width: "100%", height: "100%", objectFit: "contain" };
      const vol = silent || clip.muted ? 0 : clip.volume;
      // Server render: OffthreadVideo (ffmpeg) — headless Chromium can't reliably
      // decode/seek H.264 via an HTML5 <video>, which times out delayRender.
      // Live Player: <Video> with Remotion's default time tolerance — it deliberately
      // doesn't re-seek on small drift while playing (smooth), seeks to within ~1 frame
      // when paused (frame-exact), and re-syncs big drift / stalls (>0.45s). Overriding
      // it caused either stutter (too tight) or freeze/drift (too loose).
      return getRemotionEnvironment().isRendering ? (
        <OffthreadVideo src={clip.src} startFrom={clip.trimStart} volume={vol} playbackRate={clip.playbackRate} style={style} />
      ) : (
        <Video src={clip.src} startFrom={clip.trimStart} volume={vol} playbackRate={clip.playbackRate} style={style} />
      );
    }
    case "image":
      return <Img src={clip.src} style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
    case "audio":
      return (
        <Audio
          src={clip.src}
          startFrom={clip.trimStart}
          volume={silent || clip.muted ? 0 : clip.volume}
          acceptableTimeShiftInSeconds={999}
        />
      );
    case "text":
      return <TextClipRenderer clip={clip} />;
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

  // Absolute timeline frame, and whether an overlay's own [start,duration] window
  // is active now — animations/effects can be timed independently of the clip.
  const absFrame = clip.start + frame;
  const active = (o: { start?: number; duration?: number }) => {
    const s = o.start ?? clip.start;
    const d = o.duration ?? clip.duration;
    return absFrame >= s && absFrame < s + d;
  };

  const anim = composeAnimations(
    clip.animations
      .filter(active)
      .map((a) => ({
        type: a.type,
        params: a.params,
        frame: absFrame - (a.start ?? clip.start),
        durationInFrames: a.duration ?? clip.duration,
      })),
    fps,
  );

  // Reframe (zoom-to-region) effects modify the whole-clip transform.
  let reframeX = 0;
  let reframeY = 0;
  let reframeScale = 1;
  for (const e of clip.effects) {
    const def = regionEffectRegistry[e.type];
    if (def?.mode === "reframe" && def.reframe && e.region && active(e)) {
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

  // Glow (bloom): a blurred, brightened copy of the clip screen-blended on top.
  // CSS-only so it doesn't reintroduce the WebGL-decoder playback stutter.
  const glow = clip.effects.find((e) => e.type === "glow" && active(e));
  const glowLayer = glow
    ? (() => {
        const p = glow.params;
        const radius = typeof p.radius === "number" ? p.radius : 10;
        const intensity = typeof p.intensity === "number" ? p.intensity : 1;
        const threshold = typeof p.threshold === "number" ? p.threshold : 0.5;
        return (
          <AbsoluteFill
            style={{
              mixBlendMode: "screen",
              // higher threshold → more contrast so only the brightest areas bloom
              filter: `blur(${radius}px) brightness(${1 + intensity}) contrast(${1 + threshold * 3})`,
              pointerEvents: "none",
            }}
          >
            <InnerContent clip={clip} silent />
          </AbsoluteFill>
        );
      })()
    : null;

  // Region overlay layers (selection-area tool, CSS-masked to a rect).
  const regionLayers = clip.effects
    .map((e) => {
      const def = regionEffectRegistry[e.type];
      if (!def || def.mode !== "region" || !def.layerStyle || !e.region || !active(e)) return null;
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

  // Animation applied to a region: a copy of the clip content, masked to the rect and
  // driven by the chosen animation (slam in, blur out, …) over the effect's own window.
  const regionAnimLayers = clip.effects
    .map((e) => {
      const aDef = animationRegistry[e.type];
      if (!aDef || !e.region || !active(e)) return null;
      const r = e.region;
      const left = r.x * width;
      const top = r.y * height;
      const w = r.width * width;
      const h = r.height * height;
      const aDur = e.duration ?? clip.duration;
      const s = aDef.apply({ frame: absFrame - (e.start ?? clip.start), durationInFrames: aDur, fps, params: e.params });
      return (
        <AbsoluteFill
          key={e.id}
          style={{ clipPath: `inset(${top}px ${width - left - w}px ${height - top - h}px ${left}px)`, pointerEvents: "none" }}
        >
          <AbsoluteFill
            style={{
              transform: `translate(${s.translateX ?? 0}px, ${s.translateY ?? 0}px) scale(${s.scale ?? 1}) rotate(${s.rotate ?? 0}deg)`,
              transformOrigin: `${left + w / 2}px ${top + h / 2}px`,
              opacity: s.opacity ?? 1,
              filter: s.blur ? `blur(${s.blur}px)` : undefined,
            }}
          >
            <InnerContent clip={clip} silent />
          </AbsoluteFill>
        </AbsoluteFill>
      );
    })
    .filter(Boolean);

  return (
    // Outer fill is composition/screen space. Region overlays (highlight box, blur,
    // spotlight…) live here so they stay pinned to the frame area the user drew,
    // rather than inheriting the clip's move/scale/zoom transform and drifting off.
    <AbsoluteFill>
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
        {glowLayer}
        {regionAnimLayers}
      </AbsoluteFill>
      {regionLayers}
    </AbsoluteFill>
  );
};
