import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import phrases from '../public/ep14/phrases.json';

type Phrase = {text: string; start: number; hold: number; style: 'punch' | 'reflective'};

/**
 * EP14 phrase cards — paleta vintage clay (terracotta + dourado + cream).
 * Punch: Cinzel uppercase dourado.
 * Reflective: Caveat Brush cream-cinzel manuscrito.
 * Texto puro com sombra forte + WebkitTextStroke (sem fundo).
 */
export const PhraseCardsEp14: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {(phrases as Phrase[]).map((p, i) => {
        const localT = t - p.start;
        if (localT < 0 || localT > p.hold + 0.5) return null;

        const fadeIn = interpolate(localT, [0, 0.5], [0, 1], {extrapolateRight: 'clamp'});
        const fadeOut = interpolate(localT, [p.hold, p.hold + 0.5], [1, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        const opacity = Math.min(fadeIn, fadeOut);
        const drift = interpolate(localT, [0, p.hold + 0.5], [-8, 4]);

        const isPunch = p.style === 'punch';
        const fontFamily = isPunch
          ? '"Cinzel", "Trajan Pro", "Times New Roman", serif'
          : '"Caveat Brush", "Caveat", cursive';
        const color = isPunch ? '#f4d27a' : '#fdf3d4';
        const fontSize = isPunch ? 96 : 90;
        const fontWeight = isPunch ? 800 : 700;
        const letterSpacing = isPunch ? 5 : 0;
        const transform = isPunch ? 'rotate(-0.8deg)' : 'rotate(-0.4deg)';

        const punchShadow =
          '0 5px 20px rgba(0,0,0,0.95), 0 0 10px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,1)';
        const reflectiveShadow =
          '0 4px 16px rgba(0,0,0,0.9), 0 0 7px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)';

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '74%',
              left: '50%',
              transform: `translate(-50%, ${drift}px) ${transform}`,
              opacity,
              maxWidth: width * 0.86,
              fontFamily,
              color,
              fontSize,
              fontWeight,
              letterSpacing,
              textAlign: 'center',
              lineHeight: 1.05,
              textTransform: isPunch ? 'uppercase' : 'none',
              whiteSpace: 'pre-line',
              textShadow: isPunch ? punchShadow : reflectiveShadow,
              WebkitTextStroke: isPunch ? '1.6px rgba(0,0,0,0.85)' : '1.2px rgba(0,0,0,0.65)',
              padding: '0 28px',
            }}
          >
            {p.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
