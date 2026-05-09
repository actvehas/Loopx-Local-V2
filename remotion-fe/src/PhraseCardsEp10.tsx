import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import phrases from '../public/ep10/phrases.json';

type Phrase = {
  text: string;
  start: number;
  hold: number;
  style: 'punch' | 'reflective';
};

/**
 * Frases-âncora EP10 — paleta dourada+burgundy sobre pergamino.
 * Punch: Bangers uppercase âmbar dourado.
 * Reflective: Architects Daughter cream com leve burgundy underline.
 */
export const PhraseCardsEp10: React.FC = () => {
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
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const opacity = Math.min(fadeIn, fadeOut);
        const drift = interpolate(localT, [0, p.hold + 0.5], [-8, 4]);

        const isPunch = p.style === 'punch';
        const fontFamily = isPunch
          ? '"Bangers", "Anton", "Impact", sans-serif'
          : '"Architects Daughter", "Caveat", cursive';
        const color = isPunch ? '#f4c860' : '#3a2614';
        const fontSize = isPunch ? 102 : 80;
        const fontWeight = isPunch ? 700 : 600;
        const letterSpacing = isPunch ? 4 : 0;
        const transform = isPunch ? 'rotate(-1.5deg)' : 'rotate(-0.4deg)';

        // Lower-third position (não cobre stick figure central)
        const verticalPos = isPunch ? '74%' : '76%';

        // Punch: dourado com sombra preta forte
        // Reflective: cream com sombra preta forte
        const punchShadow =
          '0 4px 18px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,1)';
        const reflectiveShadow =
          '0 3px 14px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.75), 0 0 2px rgba(0,0,0,1)';

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: verticalPos,
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
              WebkitTextStroke: isPunch ? '1.5px rgba(0,0,0,0.85)' : '1px rgba(0,0,0,0.6)',
              padding: '0 24px',
            }}
          >
            {p.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
