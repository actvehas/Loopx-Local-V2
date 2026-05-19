import React from "react";
import { OffthreadVideo, staticFile, Loop } from "remotion";

interface Props {
  file: string;
  durationFrames: number;
}

export const SceneVideo: React.FC<Props> = ({ file, durationFrames }) => {
  // Use bounced version (forward+reverse) if it exists, otherwise original
  const bouncedFile = `assets/Cenas-bounced/${file}`;
  const originalFile = `assets/Cenas/${file}`;

  return (
    <div style={{ width: 1920, height: 1080, overflow: "hidden" }}>
      <Loop durationInFrames={durationFrames}>
        <OffthreadVideo
          src={staticFile(bouncedFile)}
          muted
          onError={() => {
            // fallback handled by Remotion error boundary
          }}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </Loop>
    </div>
  );
};
