import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import phrases from '../public/ep09/phrases.json';

type Phrase = {
  text: string;
  start: number;
  hold: number;
  style: 'punch' | 'reflective';
};

/**
 * Frases-âncora estilo EP07 — pontos chaves do roteiro com mensagem condensada.
 * Alterna entre 'punch' (Bangers uppercase, âmbar) e 'reflective' (Caveat itálico, branco).
 * Fundo translúcido azul-escuro pra integrar com BlueprintBackdrop.
 */
export const PhraseCards: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {(phrases as Phrase[]).map((p, i) => {
        const localT = t - p.start;
        if (localT < 0 || localT > p.hold + 0.5) return null;

        // fade in/out 500ms
        const fadeIn = interpolate(localT, [0, 0.5], [0, 1], {extrapolateRight: 'clamp'});
        const fadeOut = interpolate(
          localT,
          [p.hold, p.hold + 0.5],
          [1, 0],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
        );
        const opacity = Math.min(fadeIn, fadeOut);

        // drift vertical -10→+4 pra "respirar"
        const drift = interpolate(localT, [0, p.hold + 0.5], [-10, 4]);

        const isPunch = p.style === 'punch';
        const fontFamily = isPunch
          ? '"Bangers", "Anton", "Impact", sans-serif'
          : '"Caveat", "Patrick Hand", cursive';
        const color = isPunch ? '#f4d27a' : '#fdf3d4';
        const fontSize = isPunch ? 96 : 84;
        const fontWeight = isPunch ? 700 : 600;
        const letterSpacing = isPunch ? 3 : 0;
        const transform = isPunch ? 'rotate(-1.2deg)' : 'rotate(-0.6deg) skewX(-3deg)';

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(-50%, calc(-50% + ${drift}px))`,
              opacity,
              maxWidth: width * 0.78,
              padding: '28px 44px',
              backgroundColor: 'rgba(8, 26, 42, 0.78)',
              border: '1px solid rgba(126, 176, 212, 0.28)',
              borderRadius: 12,
              boxShadow: '0 14px 38px rgba(0,0,0,0.55)',
              backdropFilter: 'blur(2px)',
            }}
          >
            <div
              style={{
                fontFamily,
                color,
                fontSize,
                fontWeight,
                letterSpacing,
                textAlign: 'center',
                lineHeight: 1.05,
                textTransform: isPunch ? 'uppercase' : 'none',
                whiteSpace: 'pre-line',
                textShadow: '0 4px 14px rgba(0,0,0,0.65)',
                transform,
              }}
            >
              {p.text}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
