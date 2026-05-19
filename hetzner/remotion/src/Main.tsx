import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { SceneImage } from "./components/SceneImage";
import { SceneVideo } from "./components/SceneVideo";
import { SentenceCard } from "./components/SentenceCard";
import type { SceneData } from "./lib/parse-scenes";
import type { SubtitleEntry } from "./lib/parse-srt";

interface MainProps {
  scenes: SceneData[];
  subtitles: SubtitleEntry[];
}

export const Main: React.FC<MainProps> = ({ scenes, subtitles }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* Layer 1: Scene visuals */}
      {scenes.map((scene, idx) => {
        // If scene file is missing, use previous scene's file as fallback
        let file = scene.file;
        let isVideo = scene.isVideo;
        if (!file && idx > 0) {
          file = scenes[idx - 1].file;
          isVideo = scenes[idx - 1].isVideo;
        }
        if (!file) return null;

        return (
          <Sequence
            key={scene.sceneNum}
            from={scene.startFrame}
            durationInFrames={scene.durationFrames}
          >
            {isVideo ? (
              <SceneVideo
                file={file}
                durationFrames={scene.durationFrames}
              />
            ) : (
              <SceneImage
                file={file}
                sceneNum={scene.sceneNum}
                durationFrames={scene.durationFrames}
              />
            )}
          </Sequence>
        );
      })}

      {/* Layer 2: Sentence card subtitles (estatico por bloco — spec C1 gerenteFe) */}
      <AbsoluteFill>
        <SentenceCard subtitles={subtitles} />
      </AbsoluteFill>

      {/* Layer 3: Audio */}
      <Audio src={staticFile("assets/audio.wav")} />
    </AbsoluteFill>
  );
};
