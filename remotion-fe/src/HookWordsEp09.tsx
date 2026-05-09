import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

type HookWord = {
  text: string;
  start: number; // segundo de aparição
  hold?: number; // duração total (default 1.4s)
  position: 'tl' | 'tr' | 'bl' | 'br';
  rotation: number; // graus
};

const POSITIONS = {
  tl: {top: 60, left: 60, textAlign: 'left' as const},
  tr: {top: 60, right: 60, textAlign: 'right' as const},
  bl: {bottom: 90, left: 60, textAlign: 'left' as const},
  br: {bottom: 90, right: 60, textAlign: 'right' as const},
};

/**
 * 4 palavras agressivas EP09 nos primeiros 7s.
 * Cores combinam com Format v5 Blueprint (azul + âmbar).
 */
const HOOK_WORDS_EP09: HookWord[] = [
  {text: 'MENTIRAS', start: 0.6, position: 'tl', rotation: -5},
  {text: 'DIEZMO', start: 2.0, position: 'tr', rotation: 4},
  {text: 'CONTEXTO', start: 3.5, position: 'bl', rotation: -3},
  {text: 'BIBLIA', start: 5.5, position: 'br', rotation: 6},
];

export const HookWordsEp09: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {HOOK_WORDS_EP09.map((w, i) => {
        const hold = w.hold ?? 1.4;
        const localT = t - w.start;
        if (localT < 0 || localT > hold + 0.4) return null;

        // scale 0.5→1.0 ease-out 180ms
        const scale = interpolate(localT, [0, 0.18], [0.5, 1.0], {
          extrapolateRight: 'clamp',
        });
        // opacity fade in 180ms / fade out 400ms
        const fadeIn = interpolate(localT, [0, 0.18], [0, 1], {
          extrapolateRight: 'clamp',
        });
        const fadeOut = interpolate(localT, [hold, hold + 0.4], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const opacity = Math.min(fadeIn, fadeOut);

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...POSITIONS[w.position],
              fontFamily: '"Special Elite", "Courier New", monospace',
              fontSize: 110,
              fontWeight: 700,
              color: '#f4d27a', // amber accent for blueprint
              textShadow: '0 4px 14px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.9)',
              letterSpacing: 2,
              opacity,
              transform: `rotate(${w.rotation}deg) scale(${scale})`,
              textTransform: 'uppercase',
            }}
          >
            {w.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
