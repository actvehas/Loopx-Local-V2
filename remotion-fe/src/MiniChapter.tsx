import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

type Props = {
  start: number; // segundo de início
  duration?: number; // segundos (default 1.8)
  label: string;
  bgColor?: string;
};

/**
 * Tela de transição entre pontos da lista.
 * Exibe label grande sobre fundo de cor sólida vibrante por 1.8s.
 */
export const MiniChapter: React.FC<Props> = ({
  start,
  duration = 1.8,
  label,
  bgColor = '#b56b3e',
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const localT = t - start;

  if (localT < 0 || localT >= duration) return null;

  // entrada whoosh: fade in 200ms + scale-in
  const fadeIn = interpolate(localT, [0, 0.2], [0, 1], {extrapolateRight: 'clamp'});
  const fadeOut = interpolate(
    localT,
    [duration - 0.3, duration],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
  const opacity = Math.min(fadeIn, fadeOut);
  const scale = interpolate(localT, [0, 0.4], [0.85, 1.0], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        opacity,
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${scale})`,
          fontFamily: 'Impact, Anton, sans-serif',
          color: '#fff',
          fontSize: 180,
          fontWeight: 900,
          letterSpacing: 4,
          textTransform: 'uppercase',
          textShadow: '0 6px 22px rgba(0,0,0,0.45)',
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};
