import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

type TypewriterEntry = {
  text: string;
  start: number; // segundo
  cps?: number; // caracteres por segundo (default 13)
  position?: 'top' | 'center' | 'bottom';
};

/**
 * Typewriter reveal — usado em silêncios/pausas dramáticas.
 * Texto digitado letra-a-letra em Special Elite com cursor blinking.
 * SFX: pre-mixed typewriter track tocada em paralelo (ver public/ep10/typewriter-track-N.mp3)
 */
const ENTRIES: TypewriterEntry[] = [
  // Hook ~5-7s — Mt 7:15 versículo
  {text: 'MATEO 7:15', start: 5.5, cps: 11, position: 'top'},
  // Pausa dramática Señal 3 ~254s
  {text: 'PAUSA.', start: 254, cps: 5, position: 'center'},
  // Provocação Señal 1 final ~140s
  {text: '¿SEGUIRÍAS CREYENDO?', start: 142, cps: 13, position: 'bottom'},
];

const POSITIONS: Record<string, React.CSSProperties> = {
  top: {top: '7%', left: '50%', transform: 'translateX(-50%)'},
  center: {top: '50%', left: '50%', transform: 'translate(-50%,-50%)'},
  bottom: {bottom: '14%', left: '50%', transform: 'translateX(-50%)'},
};

export const TypewriterReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {ENTRIES.map((e, i) => {
        const cps = e.cps ?? 13;
        const localT = t - e.start;
        const totalDur = e.text.length / cps;
        const holdAfter = 1.8;
        const fadeOut = 0.6;
        const totalLife = totalDur + holdAfter + fadeOut;

        if (localT < -0.05 || localT > totalLife) return null;

        const charsShown = Math.max(0, Math.min(e.text.length, Math.floor(localT * cps)));
        const visibleText = e.text.slice(0, charsShown);

        const opacity =
          localT > totalDur + holdAfter
            ? Math.max(0, 1 - (localT - totalDur - holdAfter) / fadeOut)
            : 1;

        const pos = POSITIONS[e.position ?? 'center'];
        const cursorOn = Math.floor(localT * 2) % 2 === 0;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              opacity,
              fontFamily: '"Special Elite", "Courier New", monospace',
              fontSize: 78,
              fontWeight: 700,
              color: '#3a2614',
              backgroundColor: 'rgba(245, 230, 195, 0.85)',
              padding: '18px 32px',
              border: '1.5px solid rgba(80,50,20,0.5)',
              borderRadius: 4,
              boxShadow: '0 6px 22px rgba(40,20,5,0.45), inset 0 0 0 1px rgba(120,80,40,0.2)',
              letterSpacing: 2,
              whiteSpace: 'pre',
            }}
          >
            {visibleText}
            <span
              style={{
                display: 'inline-block',
                width: 4,
                height: '0.95em',
                marginLeft: 4,
                backgroundColor: '#3a2614',
                verticalAlign: 'text-bottom',
                opacity: localT < totalDur + holdAfter && cursorOn ? 1 : 0,
              }}
            />
          </div>
        );
      })}

      {/* SFX: 1 click por caractere via Sequence (Remotion mixa) */}
      {ENTRIES.flatMap((e, i) => {
        const cps = e.cps ?? 13;
        const chars = e.text.split('');
        return chars
          .map((ch, ci) => {
            if (ch === ' ' || ch === '.') return null;
            const clickStart = Math.round((e.start + ci / cps) * fps);
            return (
              <Sequence
                key={`c-${i}-${ci}`}
                from={clickStart}
                durationInFrames={Math.round(0.07 * fps)}
              >
                <Audio src={staticFile('ep10/typewriter-click.mp3')} volume={0.32} />
              </Sequence>
            );
          })
          .filter(Boolean);
      })}

      {/* Bell ao final de cada entry */}
      {ENTRIES.map((e, i) => {
        const cps = e.cps ?? 13;
        const bellStart = Math.round((e.start + e.text.length / cps) * fps);
        return (
          <Sequence
            key={`b-${i}`}
            from={bellStart}
            durationInFrames={Math.round(0.45 * fps)}
          >
            <Audio src={staticFile('ep10/typewriter-bell.mp3')} volume={0.25} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
