import React from "react";
import {
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
} from "remotion";
import { getKenBurns } from "../lib/ken-burns";

interface Props {
  file: string;
  sceneNum: number;
  durationFrames: number;
}

export const SceneImage: React.FC<Props> = ({
  file,
  sceneNum,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const kb = getKenBurns(sceneNum);

  // Linear interpolation — constant velocity
  const progress = interpolate(frame, [0, Math.max(durationFrames - 1, 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = interpolate(progress, [0, 1], [kb.zoomStart, kb.zoomEnd]);

  // Use transform-origin for pan direction (no translate — avoids sub-pixel jitter)
  const originX = interpolate(progress, [0, 1], [50 + kb.panXStart * 50, 50 + kb.panXEnd * 50]);
  const originY = interpolate(progress, [0, 1], [50 + kb.panYStart * 50, 50 + kb.panYEnd * 50]);

  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile(`assets/Cenas/${file}`)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center center",
          transform: `scale(${scale})`,
          transformOrigin: `${originX}% ${originY}%`,
          willChange: "transform",
        }}
      />
    </div>
  );
};
