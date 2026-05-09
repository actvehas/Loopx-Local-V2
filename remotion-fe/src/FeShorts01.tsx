import {AbsoluteFill, Audio, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {loadFont as loadSpecialElite} from '@remotion/google-fonts/SpecialElite';
import {loadFont as loadArchitectsDaughter} from '@remotion/google-fonts/ArchitectsDaughter';
import {loadFont as loadBangers} from '@remotion/google-fonts/Bangers';
import {ChannelSeal} from './ChannelSeal';
import phrases from '../public/shorts01/phrases.json';

loadSpecialElite();
loadArchitectsDaughter();
loadBangers();

type Phrase = {text: string; start: number; hold: number; style: 'punch' | 'reflective'};

type Props = {videoSrc: string; audioSrc: string};

/**
 * Shorts #01 — La Frase del Teléfono (1080×1920 vertical, 49s)
 *
 * Camadas:
 *  1. OffthreadVideo fullscreen (cenas vertical do Flow)
 *  2. Audio narración (vol 1.0) + Spy Glass music (vol 0.07)
 *  3. PhraseCards lower-third (6 frases-âncora sem fundo)
 *  4. ChannelSeal top-right pequeno
 */
export const FeShorts01: React.FC<Props> = ({videoSrc, audioSrc}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      {videoSrc && (
        <OffthreadVideo
          src={staticFile(videoSrc)}
          muted
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      )}

      {audioSrc && <Audio src={staticFile(audioSrc)} volume={1.0} />}
      <Audio src={staticFile('shorts01/music.mp3')} volume={0.07} />

      {/* PhraseCards — texto puro com sombra forte, lower-third */}
      {(phrases as Phrase[]).map((p, i) => {
        const localT = t - p.start;
        if (localT < 0 || localT > p.hold + 0.5) return null;

        const fadeIn = interpolate(localT, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'});
        const fadeOut = interpolate(localT, [p.hold, p.hold + 0.5], [1, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        const opacity = Math.min(fadeIn, fadeOut);
        const drift = interpolate(localT, [0, p.hold + 0.5], [-10, 6]);

        const isPunch = p.style === 'punch';
        const fontFamily = isPunch
          ? '"Bangers", "Anton", "Impact", sans-serif'
          : '"Architects Daughter", cursive';
        const color = isPunch ? '#f4c860' : '#fdf3d4';
        const fontSize = isPunch ? 130 : 96;
        const transform = isPunch ? 'rotate(-1.5deg)' : 'rotate(-0.5deg)';
        const shadow = isPunch
          ? '0 6px 22px rgba(0,0,0,0.95), 0 0 12px rgba(0,0,0,0.85), 0 0 3px rgba(0,0,0,1)'
          : '0 4px 18px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,1)';
        const stroke = isPunch
          ? '2px rgba(0,0,0,0.85)'
          : '1.5px rgba(0,0,0,0.7)';

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '68%',
              left: '50%',
              transform: `translate(-50%, ${drift}px) ${transform}`,
              opacity,
              maxWidth: width * 0.86,
              fontFamily,
              color,
              fontSize,
              fontWeight: 700,
              letterSpacing: isPunch ? 4 : 0,
              textAlign: 'center',
              lineHeight: 1.05,
              textTransform: isPunch ? 'uppercase' : 'none',
              whiteSpace: 'pre-line',
              textShadow: shadow,
              WebkitTextStroke: stroke,
              padding: '0 32px',
            }}
          >
            {p.text}
          </div>
        );
      })}

      <ChannelSeal position="top-right" opacity={0.7} size={130} />
    </AbsoluteFill>
  );
};
