import React from "react";
import { Composition, getInputProps } from "remotion";
import { Main } from "./Main";

const inputProps = getInputProps() as any;
const totalFrames = inputProps?.totalFrames || 172440;
const scenes = inputProps?.scenes || [];
const subtitles = inputProps?.subtitles || [];

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Main"
    component={Main}
    durationInFrames={totalFrames}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{
      scenes,
      subtitles,
    }}
  />
);
