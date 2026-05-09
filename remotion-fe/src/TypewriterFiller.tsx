import {AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate} from 'remotion';
import {loadFont as loadSpecialElite} from '@remotion/google-fonts/SpecialElite';

loadSpecialElite();

type Props = {
  text: string; // pode ter \n para line breaks
  cps?: number; // chars per second (default 13)
};

/**
 * Filler para cenas onde o Flow não gerou clip.
 * Fundo BRANCO + texto preto Special Elite com efeito typewriter + cursor blinking.
 */
export const TypewriterFiller: React.FC<Props> = ({text, cps = 13}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const t = frame / fps;
  const totalDur = durationInFrames / fps;

  // Subtle paper texture vignette
  const charsTotal = text.length;
  const charsShown = Math.max(0, Math.min(charsTotal, Math.floor(t * cps)));
  const visibleText = text.slice(0, charsShown);

  // Cursor blink (every 0.5s)
  const cursorOn = Math.floor(t * 2) % 2 === 0;

  // Slight zoom-in (1.0 → 1.04 over duration)
  const scale = interpolate(t, [0, totalDur], [1.0, 1.04]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#fafaf6',
        // micro paper texture vignette
        backgroundImage:
          'radial-gradient(ellipse at center, transparent 60%, rgba(180,160,120,0.18) 100%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '6%',
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            fontFamily: '"Special Elite", "Courier New", monospace',
            fontSize: 88,
            fontWeight: 700,
            color: '#1a1208',
            textAlign: 'center',
            lineHeight: 1.18,
            whiteSpace: 'pre-line',
            letterSpacing: 2,
            maxWidth: '90%',
          }}
        >
          {visibleText}
          <span
            style={{
              display: 'inline-block',
              width: 4,
              height: '0.92em',
              marginLeft: 6,
              backgroundColor: '#1a1208',
              verticalAlign: 'text-bottom',
              opacity: cursorOn ? 1 : 0,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
