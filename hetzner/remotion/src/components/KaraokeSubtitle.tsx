import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { SubtitleEntry } from "../lib/parse-srt";

interface Props {
  subtitles: SubtitleEntry[];
}

function interpolateColor(progress: number): string {
  const r = 255;
  const g = Math.round(255 - (255 - 215) * progress);
  const b = Math.round(255 - 255 * progress);
  return `rgb(${r}, ${g}, ${b})`;
}

export const KaraokeSubtitle: React.FC<Props> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = frame / fps;

  const active = subtitles.find(
    (s) => currentSec >= s.startSec && currentSec <= s.endSec
  );

  if (!active) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "10%",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignContent: "center",
        gap: "6px 8px",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        padding: "12px 24px",
        borderRadius: "8px",
        maxWidth: "80%",
        maxHeight: "120px",
        overflow: "hidden",
        lineHeight: "1.2",
      }}
    >
      {active.words.map((word, i) => {
        const wordProgress = interpolate(
          currentSec,
          [word.startSec, word.endSec],
          [0, 1],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        const color =
          wordProgress > 0.5
            ? "#FFD700"
            : currentSec >= word.startSec
              ? interpolateColor(wordProgress)
              : "rgba(255, 255, 255, 0.7)";

        return (
          <span
            key={i}
            style={{
              fontFamily: "'Georgia', serif",
              fontWeight: "bold",
              fontSize: "44px",
              color,
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
              lineHeight: "1.2",
            }}
          >
            {word.word}
          </span>
        );
      })}
    </div>
  );
};
