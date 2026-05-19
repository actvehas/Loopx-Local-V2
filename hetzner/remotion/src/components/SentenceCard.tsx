import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { SubtitleEntry } from "../lib/parse-srt";

interface Props {
  subtitles: SubtitleEntry[];
}

/**
 * Sentence card estático — mostra a frase inteira da entry SRT ativa.
 * Sem karaoke palavra-a-palavra. Spec C1 do skill /gerenteFe:
 * ALL CAPS, sans condensada, branca com outline preto, leve fade in/out.
 */
export const SentenceCard: React.FC<Props> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentSec = frame / fps;

  const active = subtitles.find(
    (s) => currentSec >= s.startSec && currentSec <= s.endSec
  );
  if (!active) return null;

  // Fade in/out 200ms nas pontas pra evitar pop
  const FADE = 0.2;
  const dur = active.endSec - active.startSec;
  const localT = currentSec - active.startSec;
  const opacity = interpolate(
    localT,
    [0, FADE, dur - FADE, dur],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) }
  );

  // ALL CAPS sentence
  const text = active.text.toUpperCase();

  return (
    <div
      style={{
        position: "absolute",
        bottom: "8%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "85%",
        textAlign: "center",
        opacity,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          fontFamily: "'Impact', 'Bebas Neue', 'Anton', 'Arial Narrow', sans-serif",
          fontWeight: 900,
          fontSize: "62px",
          lineHeight: "1.15",
          letterSpacing: "1px",
          color: "#FFFFFF",
          // Outline preto grosso pra legibilidade em fundo sépia
          textShadow: [
            "-3px -3px 0 #000",
            "3px -3px 0 #000",
            "-3px 3px 0 #000",
            "3px 3px 0 #000",
            "0 0 12px rgba(0,0,0,0.55)",
          ].join(", "),
        }}
      >
        {text}
      </span>
    </div>
  );
};
