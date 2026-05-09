import {AbsoluteFill, Audio, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont as loadCinzel} from '@remotion/google-fonts/Cinzel';
import {loadFont as loadCaveatBrush} from '@remotion/google-fonts/CaveatBrush';
import {loadFont as loadSpecialElite} from '@remotion/google-fonts/SpecialElite';
import {ChannelSeal} from './ChannelSeal';
import {VintageClayBackdrop} from './VintageClayBackdrop';
import {MiniChapter} from './MiniChapter';
import {PhraseCardsEp14} from './PhraseCardsEp14';
import {TypewriterRevealEp14} from './TypewriterRevealEp14';

loadCinzel();
loadCaveatBrush();
loadSpecialElite();

type Word = {word: string; start: number; end: number};
type Scene = {num: number; start: number; end: number; textZone?: 'top' | 'bottom' | 'center'};
type Props = {videoSrc: string; audioSrc: string; words: Word[]; scenes: Scene[]};

/**
 * Format v6 Vintage Clay — EP14 "6 Familiares Tóxicos"
 *
 * Camadas:
 *  1. VintageClayBackdrop (terracotta #b56b3e + grão sépia + vinheta marrom)
 *  2. OffthreadVideo (cenas pencil sketch, inset com border warm)
 *  3. Audio narração (vol 1.0)
 *  4. Music bed Black Vortex (Kevin MacLeod CC-BY) vol 0.075
 *  5. MiniChapter x6 (familiar 1-6)
 *  6. PhraseCardsEp14 (19 frases-âncora sem fundo)
 *  7. TypewriterRevealEp14 (MESA PUESTA hook + PAUSA hijo)
 *  8. ChannelSeal top-right
 *
 * SEM Caption karaoke (regra estabelecida no EP10 v2).
 */
export const FeVideoEp14: React.FC<Props> = ({videoSrc, audioSrc}) => {
  return (
    <AbsoluteFill>
      <VintageClayBackdrop />

      {videoSrc ? (
        <AbsoluteFill style={{padding: 36}}>
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 18px 50px rgba(40,20,5,0.7), 0 0 0 1px rgba(120,70,30,0.55)',
              border: '3px solid rgba(80,40,15,0.6)',
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
      <Audio src={staticFile('ep14/music.mp3')} volume={0.075} />

      {/* 6 Mini-capítulos antes de cada familiar */}
      <MiniChapter start={49}  duration={1.8} label="1" bgColor="#b56b3e" />
      <MiniChapter start={137} duration={1.8} label="2" bgColor="#c2972a" />
      <MiniChapter start={232} duration={1.8} label="3" bgColor="#6b7c4a" />
      <MiniChapter start={290} duration={1.8} label="4" bgColor="#2a1f12" />
      <MiniChapter start={412} duration={1.8} label="5" bgColor="#6e1f2a" />
      <MiniChapter start={521} duration={1.8} label="6" bgColor="#a9852e" />

      <PhraseCardsEp14 />
      <TypewriterRevealEp14 />

      <ChannelSeal position="top-right" opacity={0.7} size={88} />
    </AbsoluteFill>
  );
};
