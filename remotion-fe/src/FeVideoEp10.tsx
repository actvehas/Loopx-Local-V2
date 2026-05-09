import {AbsoluteFill, Audio, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont as loadIndieFlower} from '@remotion/google-fonts/IndieFlower';
import {loadFont as loadSpecialElite} from '@remotion/google-fonts/SpecialElite';
import {loadFont as loadArchitectsDaughter} from '@remotion/google-fonts/ArchitectsDaughter';
import {loadFont as loadBangers} from '@remotion/google-fonts/Bangers';
import {ChannelSeal} from './ChannelSeal';
import {ParchmentBackdrop} from './ParchmentBackdrop';
import {MiniChapter} from './MiniChapter';
import {PhraseCardsEp10} from './PhraseCardsEp10';
import {TypewriterReveal} from './TypewriterReveal';

loadSpecialElite();
loadArchitectsDaughter();
loadBangers();
const indie = loadIndieFlower();

type Word = {word: string; start: number; end: number};
type Scene = {num: number; start: number; end: number; textZone?: 'top' | 'bottom' | 'center'};
type Props = {
  videoSrc: string;
  audioSrc: string;
  words: Word[];
  scenes: Scene[];
};

/**
 * Format v2 Parchment Typewriter — EP10 "5 Señales del Lobo Disfrazado"
 *
 * Camadas:
 *  1. ParchmentBackdrop (pergamino bege escuro #c9b78a + manchas)
 *  2. OffthreadVideo (cenas pencil sketch — vídeo do assemble-ffmpeg)
 *  3. Audio narração
 *  4. Audio music bed Long Note Two (Kevin MacLeod CC-BY) vol 0.075
 *  5. Caption karaoke (Indie Flower)
 *  6. MiniChapter x5 (señales 1-5)
 *  7. PhraseCardsEp10 (19 frases-âncora)
 *  8. TypewriterReveal (3 momentos: Mt 7:15 hook, ¿seguirías?, PAUSA)
 *  9. ChannelSeal
 */
export const FeVideoEp10: React.FC<Props> = ({videoSrc, audioSrc, words, scenes}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  const currentScene = scenes.find((s) => t >= s.start && t < s.end);
  const zone = currentScene?.textZone || 'bottom';

  const WINDOW_BACK = 0.8;
  const WINDOW_FWD = 2.5;
  const visibleWords = words.filter(
    (w) => w.start <= t + WINDOW_FWD && w.end >= t - WINDOW_BACK
  );
  const activeIdx = visibleWords.findIndex((w) => t >= w.start && t < w.end);

  return (
    <AbsoluteFill>
      <ParchmentBackdrop />

      {videoSrc ? (
        <AbsoluteFill style={{padding: 36}}>
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 6,
              overflow: 'hidden',
              boxShadow:
                '0 18px 50px rgba(40,20,5,0.7), 0 0 0 1px rgba(80,50,20,0.6)',
              border: '3px solid rgba(58,38,20,0.55)',
            }}
          >
            <OffthreadVideo
              src={staticFile(videoSrc)}
              muted
              style={{width: '100%', height: '100%', objectFit: 'cover'}}
            />
          </div>
        </AbsoluteFill>
      ) : null}

      {audioSrc ? <Audio src={staticFile(audioSrc)} volume={1.0} /> : null}
      <Audio src={staticFile('ep10/music.mp3')} volume={0.075} />

      {/* Mini-capítulos antes de cada señal */}
      <MiniChapter start={51} duration={1.8} label="1" bgColor="#6e1f2a" />
      <MiniChapter start={148} duration={1.8} label="2" bgColor="#a9852e" />
      <MiniChapter start={248} duration={1.8} label="3" bgColor="#3a2614" />
      <MiniChapter start={327} duration={1.8} label="4" bgColor="#6e1f2a" />
      <MiniChapter start={452} duration={1.8} label="5" bgColor="#a9852e" />

      <PhraseCardsEp10 />

      <TypewriterReveal />

      <ChannelSeal position="top-right" opacity={0.7} size={88} />
    </AbsoluteFill>
  );
};
