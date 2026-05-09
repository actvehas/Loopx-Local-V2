import {AbsoluteFill, Audio, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont as loadCaveat} from '@remotion/google-fonts/Caveat';
import {loadFont as loadIndieFlower} from '@remotion/google-fonts/IndieFlower';
import {loadFont as loadBangers} from '@remotion/google-fonts/Bangers';
import {Caption} from './Caption';
import {ChannelSeal} from './ChannelSeal';
import {BlueprintBackdrop} from './BlueprintBackdrop';
import {MiniChapter} from './MiniChapter';
import {PhraseCards} from './PhraseCards';

loadCaveat();
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
 * Format v5 Blueprint Inverso — EP09 "3 Mentiras del Diezmo"
 * Re-edit estilo EP07: phrase cards condensadas + music bed + sem hook words isoladas.
 *
 * Camadas:
 *  1. BlueprintBackdrop
 *  2. OffthreadVideo (cenas pencil sketch, inset com border + shadow)
 *  3. Audio narração (vol 1.0)
 *  4. Audio music bed contemplative-piano (vol 0.10, YT Audio Library)
 *  5. Caption karaoke
 *  6. MiniChapter x3 (terracotta/borgonha/mostarda antes de cada PUNTO)
 *  7. PhraseCards (15 frases-âncora estilo EP07)
 *  8. ChannelSeal (selo top-right persistente)
 */
export const FeVideoEp09: React.FC<Props> = ({videoSrc, audioSrc, words, scenes}) => {
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
      <BlueprintBackdrop />

      {videoSrc ? (
        <AbsoluteFill style={{padding: 32}}>
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(126,176,212,0.35)',
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
      {/* Music bed YT Audio Library — vol baixo pra não competir com narração */}
      <Audio src={staticFile('ep09/music.mp3')} volume={0.085} />

      <Caption
        words={visibleWords}
        activeIdx={activeIdx}
        zone={zone}
        fontFamily={indie.fontFamily}
        currentTime={t}
      />

      {/* Mini-capítulos antes de cada PUNTO */}
      <MiniChapter start={42.5} duration={1.8} label="1" bgColor="#b56b3e" />
      <MiniChapter start={247.5} duration={1.8} label="2" bgColor="#6e1f2a" />
      <MiniChapter start={453} duration={1.8} label="3" bgColor="#c2972a" />

      {/* Frases-âncora estilo EP07 */}
      <PhraseCards />

      <ChannelSeal position="top-right" opacity={0.7} size={77} />
    </AbsoluteFill>
  );
};
