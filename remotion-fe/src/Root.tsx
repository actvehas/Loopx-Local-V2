import {Composition, getInputProps} from 'remotion';
import {FeVideo} from './FeVideo';
import {FeVideoEp09} from './FeVideoEp09';
import {FeVideoEp10} from './FeVideoEp10';
import {TypewriterFiller} from './TypewriterFiller';
import {FeShorts01} from './FeShorts01';
import {FeVideoEp14} from './FeVideoEp14';
import {DemoGallery} from './Demos';
import {DemoGallery2} from './Demos2';
import {DemoGallery3} from './Demos3';

export const RemotionRoot: React.FC = () => {
  const props = getInputProps() as any;
  // Defaults pra preview; CLI passa via --props
  const fps = 30;
  const durationFrames = props.durationSeconds
    ? Math.ceil(props.durationSeconds * fps)
    : 60 * fps;

  return (
    <>
      <Composition
        id="FeAlDescubierto"
        component={FeVideo}
        durationInFrames={durationFrames}
        fps={fps}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: props.videoSrc || '',
          audioSrc: props.audioSrc || '',
          words: props.words || [],
          scenes: props.scenes || [],
        }}
      />
      <Composition
        id="FeVideoEp09"
        component={FeVideoEp09}
        durationInFrames={durationFrames}
        fps={fps}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: props.videoSrc || '',
          audioSrc: props.audioSrc || '',
          words: props.words || [],
          scenes: props.scenes || [],
        }}
      />
      <Composition
        id="FeVideoEp10"
        component={FeVideoEp10}
        durationInFrames={durationFrames}
        fps={fps}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: props.videoSrc || '',
          audioSrc: props.audioSrc || '',
          words: props.words || [],
          scenes: props.scenes || [],
        }}
      />
      <Composition
        id="FeVideoEp14"
        component={FeVideoEp14}
        durationInFrames={durationFrames}
        fps={fps}
        width={1280}
        height={720}
        defaultProps={{
          videoSrc: props.videoSrc || '',
          audioSrc: props.audioSrc || '',
          words: props.words || [],
          scenes: props.scenes || [],
        }}
      />
      <Composition
        id="FeShorts01"
        component={FeShorts01}
        durationInFrames={Math.ceil((props.durationSeconds || 50) * 30)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          videoSrc: props.videoSrc || '',
          audioSrc: props.audioSrc || '',
        }}
      />
      <Composition
        id="TypewriterFiller"
        component={TypewriterFiller}
        durationInFrames={240}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{text: '', cps: 13}}
      />
      <Composition
        id="DemoGallery"
        component={DemoGallery}
        durationInFrames={7 * 30 * 6}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="DemoGallery2"
        component={DemoGallery2}
        durationInFrames={7 * 30 * 10}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="DemoGallery3"
        component={DemoGallery3}
        durationInFrames={7 * 30 * 10}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};
