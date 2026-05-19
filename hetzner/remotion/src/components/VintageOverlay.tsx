import React from "react";

/**
 * Applies vintage color grading + vignette as CSS filters/overlays.
 * Replaces the ffmpeg post-processing step:
 *   colorbalance=rs=0.05:gs=-0.02:bs=-0.08,vignette=PI/4
 */
export const VintageOverlay: React.FC = () => {
  return (
    <>
      {/* Color grading: warm vintage tone via CSS filter on a full-screen overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1920,
          height: 1080,
          // Sepia warmth: boost reds, reduce blues
          background: "linear-gradient(rgba(40, 12, 0, 0.12), rgba(40, 12, 0, 0.12))",
          mixBlendMode: "color",
          pointerEvents: "none",
        }}
      />
      {/* Vignette: radial gradient darkening edges */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 1920,
          height: 1080,
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.55) 100%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
};
