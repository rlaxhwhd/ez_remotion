import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { TextClip, TextStyle } from "../types";

// CSS look presets. `css` applies to the text element; `fill` is the SVG fill
// used when the text is curved (SVG <text> uses `fill`, not `color`).
const styleFor = (
  style: TextStyle,
  baseColor: string,
  accent: string,
  frame: number,
  neonIntensity: number,
): { css: React.CSSProperties; fill: string } => {
  switch (style) {
    case "neon": {
      const k = Math.max(0.1, neonIntensity);
      return {
        css: {
          color: accent,
          textShadow: `0 0 2px #fff, 0 0 ${8 * k}px ${accent}, 0 0 ${16 * k}px ${accent}, 0 0 ${32 * k}px ${accent}`,
        },
        fill: accent,
      };
    }
    case "glitch": {
      const dx = 2 + Math.sin(frame * 0.8) * 2;
      return { css: { color: baseColor, textShadow: `${dx}px 0 #ff00c1, ${-dx}px 0 #00fff9` }, fill: baseColor };
    }
    case "3d":
      return {
        css: {
          color: accent,
          textShadow: "1px 1px 0 #c4c4c4,2px 2px 0 #adadad,3px 3px 0 #969696,4px 4px 0 #7d7d7d,5px 5px 8px rgba(0,0,0,0.45)",
        },
        fill: accent,
      };
    case "metal":
      return {
        css: {
          color: "transparent",
          backgroundImage: `linear-gradient(180deg,#ffffff 0%, ${accent} 42%, #3a3a3a 52%, #d9d9d9 100%)`,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          textShadow: "0 2px 3px rgba(0,0,0,0.35)",
        },
        fill: accent,
      };
    case "outline":
      return { css: { color: baseColor, WebkitTextStroke: `2px ${accent}` }, fill: baseColor };
    default:
      return { css: { color: baseColor }, fill: baseColor };
  }
};

export const TextClipRenderer: React.FC<{ clip: TextClip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const accent = clip.styleColor || clip.color;
  const { css, fill } = styleFor(clip.textStyle ?? "none", clip.color, accent, frame, clip.neonIntensity ?? 1);

  // ── Curved / arch text (SVG textPath) ─────────────────────────────────────
  if (clip.curve && Math.abs(clip.curve) > 0.001) {
    const pad = width * 0.08;
    const x0 = pad;
    const x1 = width - pad;
    const yMid = height / 2;
    const apex = clip.curve * height * 0.28; // positive → arch up
    const cx = width / 2;
    const cy = yMid - apex * 2; // quadratic control reaches ~half the offset
    const d = `M ${x0} ${yMid} Q ${cx} ${cy} ${x1} ${yMid}`;
    const id = `tp-${clip.id}`;
    const anchor = clip.align === "left" ? "start" : clip.align === "right" ? "end" : "middle";
    const startOffset = anchor === "middle" ? "50%" : anchor === "end" ? "100%" : "0%";
    // background-clip gradient can't fill SVG text → metal falls back to a solid accent.
    const { color: _c, backgroundImage: _b, WebkitBackgroundClip: _w, backgroundClip: _bc, ...svgCss } = css;
    return (
      <AbsoluteFill>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible" }}>
          <defs>
            <path id={id} d={d} fill="none" />
          </defs>
          <text fontSize={clip.fontSize} fontFamily={clip.fontFamily} fontWeight={clip.fontWeight} fill={fill} style={svgCss}>
            <textPath href={`#${id}`} startOffset={startOffset} textAnchor={anchor}>
              {clip.text}
            </textPath>
          </text>
        </svg>
      </AbsoluteFill>
    );
  }

  // ── Straight text box (with optional karaoke sweep) ───────────────────────
  const boxStyle: React.CSSProperties = {
    fontSize: clip.fontSize,
    fontWeight: clip.fontWeight,
    fontFamily: clip.fontFamily,
    textAlign: clip.align,
    background: clip.background,
    padding: clip.background === "transparent" ? 0 : "0.2em 0.5em",
    borderRadius: 12,
    whiteSpace: "pre-wrap",
    lineHeight: 1.2,
  };

  let content: React.ReactNode;
  if (clip.karaoke) {
    const progress = interpolate(frame, [0, Math.max(1, clip.duration)], [0, 100], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const reveal = `inset(0 ${100 - progress}% 0 0)`;
    content = (
      <span style={{ position: "relative", display: "inline-block", ...css }}>
        {clip.text}
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            color: clip.karaokeColor || "#ffd400",
            textShadow: css.textShadow,
            WebkitTextStroke: css.WebkitTextStroke,
            clipPath: reveal,
            WebkitClipPath: reveal,
          }}
        >
          {clip.text}
        </span>
      </span>
    );
  } else {
    content = <span style={css}>{clip.text}</span>;
  }

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: clip.align === "left" ? "flex-start" : clip.align === "right" ? "flex-end" : "center",
        padding: 60,
      }}
    >
      <div style={boxStyle}>{content}</div>
    </AbsoluteFill>
  );
};
