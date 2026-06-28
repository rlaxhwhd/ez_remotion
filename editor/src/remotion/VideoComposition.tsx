import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import type { Project } from "../types";
import { ClipRenderer } from "./ClipRenderer";

export type VideoCompositionProps = {
  project: Project;
};

// Renders the whole project. Clips are placed on the timeline via <Sequence>.
// Track order defines z-order: tracks lower in the list render on top.
export const VideoComposition: React.FC<VideoCompositionProps> = ({ project }) => {
  const trackIndex = new Map(project.tracks.map((t, i) => [t.id, i]));
  const visibleClips = project.clips
    .filter((c) => {
      const track = project.tracks.find((t) => t.id === c.trackId);
      if (!track) return false;
      if (track.hidden && c.kind !== "audio") return false;
      return true;
    })
    .slice()
    .sort((a, b) => (trackIndex.get(b.trackId) ?? 0) - (trackIndex.get(a.trackId) ?? 0));

  return (
    <AbsoluteFill style={{ background: project.background }}>
      {visibleClips.map((clip) => (
        <Sequence
          key={clip.id}
          from={clip.start}
          durationInFrames={Math.max(1, clip.duration)}
          layout="none"
        >
          <ClipRenderer clip={clip} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
