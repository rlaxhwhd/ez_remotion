import React, { useEffect, useState } from "react";
import { Composition, continueRender, delayRender, staticFile } from "remotion";
import type { Project } from "../types";
import { VideoComposition } from "./VideoComposition";

// Same Google Fonts as index.html — re-loaded here because the server renderer
// uses Remotion's own HTML, not our index.html.
const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&family=Black+Han+Sans&family=Jua&family=Do+Hyeon&family=Gaegu:wght@400;700&family=Nanum+Pen+Script&family=Gowun+Dodum&family=Anton&family=Bebas+Neue&family=Montserrat:wght@400;700;900&family=Playfair+Display:wght@400;700;900&family=Pacifico&display=swap";

const defaultProject: Project = {
  width: 1280,
  height: 720,
  fps: 30,
  durationInFrames: 60,
  background: "#000000",
  tracks: [],
  clips: [],
};

// Wrapper used only by the server renderer: blocks rendering until web fonts load,
// then renders the same composition the Player shows.
const RenderComposition: React.FC<{ project: Project }> = ({ project }) => {
  const [handle] = useState(() => delayRender("loading fonts"));
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      continueRender(handle);
    };
    // Google Fonts (CDN).
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
    // Local fonts bundled in public/fonts — mirrors index.html for the preview.
    const style = document.createElement("style");
    style.textContent =
      `@font-face{font-family:'BMJUA';src:url(${staticFile("fonts/BMJUA.ttf")}) format('truetype');font-display:swap;}` +
      `@font-face{font-family:'Jalnan2';src:url(${staticFile("fonts/Jalnan2.ttf")}) format('truetype');font-display:swap;}`;
    document.head.appendChild(style);
    // Wait for the CDN sheet + force-load the local faces, then all fonts ready.
    Promise.all([
      new Promise<void>((r) => {
        link.onload = () => r();
        link.onerror = () => r();
      }),
      document.fonts.load("16px BMJUA").catch(() => {}),
      document.fonts.load("16px Jalnan2").catch(() => {}),
    ])
      .then(() => document.fonts.ready)
      .then(finish);
    const t = setTimeout(finish, 8000); // fallback so a font CDN hiccup can't hang the render
    return () => clearTimeout(t);
  }, [handle]);
  return <VideoComposition project={project} />;
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="main"
      component={RenderComposition}
      durationInFrames={defaultProject.durationInFrames}
      fps={defaultProject.fps}
      width={defaultProject.width}
      height={defaultProject.height}
      defaultProps={{ project: defaultProject }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, props.project.durationInFrames),
        fps: props.project.fps,
        width: props.project.width,
        height: props.project.height,
      })}
    />
  );
};
