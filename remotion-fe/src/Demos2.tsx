/**
 * Demos2.tsx — Galeria #2 — variedade total de estilos.
 * Cada demo: 7s · 1280x720
 */
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont as loadCaveat} from '@remotion/google-fonts/Caveat';
import {loadFont as loadBebas} from '@remotion/google-fonts/BebasNeue';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadCourier} from '@remotion/google-fonts/CourierPrime';
import {loadFont as loadBangers} from '@remotion/google-fonts/Bangers';
import {loadFont as loadAnton} from '@remotion/google-fonts/Anton';

const {fontFamily: caveat} = loadCaveat();
const {fontFamily: bebas} = loadBebas();
const {fontFamily: inter} = loadInter();
const {fontFamily: courier} = loadCourier();
const {fontFamily: bangers} = loadBangers();
const {fontFamily: anton} = loadAnton();

const PAPER = '#F5F0E0';
const GRAPHITE = '#222';
const PENCIL_RED = '#D44600';
const YELLOW = '#FFE45C';

const Label: React.FC<{text: string}> = ({text}) => (
  <div style={{position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', fontFamily: inter, fontSize: 18, color: '#888'}}>
    {text}
  </div>
);

// ─────────────────────────────────────────────
// DEMO 7: Stamp impact (carimbo)
// ─────────────────────────────────────────────
const Demo7: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const drop = spring({frame: frame - 20, fps, config: {damping: 18, stiffness: 200, mass: 1.5}});
  const shake = frame > 38 && frame < 55 ? Math.sin(frame * 4) * 4 : 0;
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          fontFamily: anton,
          fontSize: 200,
          color: PENCIL_RED,
          letterSpacing: 4,
          transform: `translate(${shake}px, ${(1 - drop) * -200}px) rotate(${(1 - drop) * 8 - 3}deg) scale(${0.6 + drop * 0.4})`,
          textShadow: `6px 6px 0 ${GRAPHITE}`,
          opacity: drop,
        }}
      >
        ¡BASTA!
      </div>
      <Label text="DEMO 7 · Carimbo impacto" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 8: Glitch RGB chromatic
// ─────────────────────────────────────────────
const Demo8: React.FC = () => {
  const frame = useCurrentFrame();
  const glitchActive = (frame >= 40 && frame <= 70) || (frame >= 100 && frame <= 130);
  const offset = glitchActive ? Math.sin(frame * 3) * 6 : 0;
  return (
    <AbsoluteFill style={{backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center'}}>
      <div style={{position: 'relative'}}>
        <div style={{position: 'absolute', fontFamily: bebas, fontSize: 160, color: '#ff0044', transform: `translateX(${-offset}px)`, mixBlendMode: 'screen'}}>
          MENTIRA
        </div>
        <div style={{position: 'absolute', fontFamily: bebas, fontSize: 160, color: '#00ffcc', transform: `translateX(${offset}px)`, mixBlendMode: 'screen'}}>
          MENTIRA
        </div>
        <div style={{fontFamily: bebas, fontSize: 160, color: 'white'}}>
          MENTIRA
        </div>
      </div>
      <Label text="DEMO 8 · Glitch RGB chromático" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 9: Typewriter monoespaçado
// ─────────────────────────────────────────────
const Demo9: React.FC = () => {
  const frame = useCurrentFrame();
  const text = 'No está en la Biblia.';
  const visible = Math.min(text.length, Math.floor(frame / 4));
  const cursor = Math.floor(frame / 8) % 2 === 0;
  return (
    <AbsoluteFill style={{backgroundColor: '#0d0d0d', justifyContent: 'center', alignItems: 'center'}}>
      <div style={{fontFamily: courier, fontSize: 60, color: '#33ff33', letterSpacing: 2}}>
        {text.slice(0, visible)}
        <span style={{opacity: cursor ? 1 : 0}}>▋</span>
      </div>
      <Label text="DEMO 9 · Typewriter terminal" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 10: Yellow marker highlight (highlighter pen)
// ─────────────────────────────────────────────
const Demo10: React.FC = () => {
  const frame = useCurrentFrame();
  const swipe1 = interpolate(frame, [10, 50], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const swipe2 = interpolate(frame, [80, 120], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: 'white', justifyContent: 'center', alignItems: 'center'}}>
      <div style={{textAlign: 'center', maxWidth: 1100, lineHeight: 1.4}}>
        <div style={{fontFamily: caveat, fontSize: 56, color: '#222', display: 'inline'}}>
          La Biblia jamás llamó santa a la mujer que{' '}
          <span style={{position: 'relative', display: 'inline-block'}}>
            <span
              style={{
                position: 'absolute',
                inset: '0 0 6px 0',
                backgroundColor: YELLOW,
                width: `${swipe1 * 100}%`,
                zIndex: 0,
                transform: 'skew(-3deg)',
              }}
            />
            <span style={{position: 'relative', zIndex: 1}}>sufre golpes</span>
          </span>
          {' '}en{' '}
          <span style={{position: 'relative', display: 'inline-block'}}>
            <span
              style={{
                position: 'absolute',
                inset: '0 0 6px 0',
                backgroundColor: YELLOW,
                width: `${swipe2 * 100}%`,
                zIndex: 0,
                transform: 'skew(-3deg)',
              }}
            />
            <span style={{position: 'relative', zIndex: 1}}>silencio</span>
          </span>
          .
        </div>
      </div>
      <Label text="DEMO 10 · Marcador amarelo (highlighter)" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 11: Letras caindo individualmente
// ─────────────────────────────────────────────
const Demo11: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const text = 'JUZGAD CON JUSTICIA';
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{display: 'flex', alignItems: 'center'}}>
        {text.split('').map((ch, i) => {
          const delay = i * 3;
          const s = spring({frame: frame - delay, fps, config: {damping: 9, stiffness: 110}});
          const y = (1 - s) * -300;
          const rot = (1 - s) * (Math.random() * 30 - 15);
          return (
            <span
              key={i}
              style={{
                fontFamily: anton,
                fontSize: 100,
                color: i < 6 ? PENCIL_RED : GRAPHITE,
                transform: `translateY(${y}px) rotate(${rot}deg)`,
                opacity: s,
                display: 'inline-block',
                marginRight: ch === ' ' ? 20 : 0,
              }}
            >
              {ch === ' ' ? ' ' : ch}
            </span>
          );
        })}
      </div>
      <Label text="DEMO 11 · Letras caindo (drop & rotate)" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 12: Comic BAM card (estilo HQ)
// ─────────────────────────────────────────────
const Demo12: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const burst = spring({frame: frame - 5, fps, config: {damping: 8, stiffness: 200}});
  const wobble = Math.sin(frame * 0.3) * 2;
  return (
    <AbsoluteFill style={{backgroundColor: '#fbe54d', justifyContent: 'center', alignItems: 'center'}}>
      {/* Starburst polygon */}
      <svg
        width={900}
        height={600}
        style={{position: 'absolute', transform: `scale(${burst}) rotate(${wobble}deg)`}}
        viewBox="0 0 900 600"
      >
        <polygon
          points="450,30 510,170 670,140 580,260 730,310 580,360 670,490 510,460 450,580 390,460 230,490 320,360 170,310 320,260 230,140 390,170"
          fill="white"
          stroke={GRAPHITE}
          strokeWidth={10}
        />
      </svg>
      <div
        style={{
          fontFamily: bangers,
          fontSize: 180,
          color: PENCIL_RED,
          letterSpacing: 6,
          transform: `scale(${burst}) rotate(-6deg)`,
          textShadow: `5px 5px 0 ${GRAPHITE}`,
          zIndex: 1,
        }}
      >
        ¡FALSO!
      </div>
      <Label text="DEMO 12 · Comic BAM (HQ style)" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 13: Versículo deslizando vertical (estilo livro)
// ─────────────────────────────────────────────
const Demo13: React.FC = () => {
  const frame = useCurrentFrame();
  const slideY = interpolate(frame, [0, 40, 170, 210], [400, 0, 0, -400], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center', overflow: 'hidden'}}>
      <div style={{transform: `translateY(${slideY}px)`, textAlign: 'center'}}>
        <div style={{fontFamily: bebas, fontSize: 36, color: '#888', letterSpacing: 8, marginBottom: 24}}>
          PROVERBIOS 16 · 9
        </div>
        <div style={{fontFamily: caveat, fontSize: 64, color: GRAPHITE, lineHeight: 1.3, maxWidth: 900}}>
          "El corazón del hombre piensa<br />su camino, mas Jehová<br />endereza sus pasos."
        </div>
      </div>
      <Label text="DEMO 13 · Slide vertical estilo livro" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 14: Mask reveal (palavra revelada por cortina)
// ─────────────────────────────────────────────
const Demo14: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [10, 60], [0, 100], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: '#1c1c1c', justifyContent: 'center', alignItems: 'center'}}>
      <div style={{position: 'relative', overflow: 'hidden', padding: 40}}>
        <div style={{fontFamily: anton, fontSize: 140, color: 'white', letterSpacing: 6, clipPath: `inset(0 ${100 - reveal}% 0 0)`}}>
          NO ES BÍBLICO
        </div>
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${reveal}%`,
            width: 6,
            backgroundColor: PENCIL_RED,
            opacity: reveal < 100 ? 1 : 0,
          }}
        />
      </div>
      <Label text="DEMO 14 · Mask reveal com barra" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 15: Speech bubble cartoon
// ─────────────────────────────────────────────
const Demo15: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const pop = spring({frame: frame - 15, fps, config: {damping: 7, stiffness: 140}});
  const wobble = Math.sin(frame * 0.15) * 3;
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{position: 'relative', transform: `scale(${pop}) rotate(${wobble}deg)`}}>
        {/* Bubble */}
        <div
          style={{
            backgroundColor: 'white',
            border: `5px solid ${GRAPHITE}`,
            borderRadius: 50,
            padding: '40px 70px',
            boxShadow: `6px 6px 0 ${GRAPHITE}`,
          }}
        >
          <div style={{fontFamily: caveat, fontSize: 64, color: GRAPHITE}}>
            ¿Y si te lo enseñaron mal?
          </div>
        </div>
        {/* Tail */}
        <svg width={100} height={80} style={{position: 'absolute', bottom: -50, left: 60}} viewBox="0 0 100 80">
          <polygon points="20,0 60,0 30,70" fill="white" stroke={GRAPHITE} strokeWidth={5} strokeLinejoin="round" />
        </svg>
      </div>
      <Label text="DEMO 15 · Speech bubble cartoon" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 16: Vintage paper telegram
// ─────────────────────────────────────────────
const Demo16: React.FC = () => {
  const frame = useCurrentFrame();
  const text = 'STOP · NO ES PALABRA DE DIOS · STOP';
  const visible = Math.min(text.length, Math.floor(frame / 3));
  return (
    <AbsoluteFill style={{backgroundColor: '#3d2f1a', justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          backgroundColor: '#f0e4c8',
          padding: 60,
          maxWidth: 950,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          transform: 'rotate(-1.5deg)',
          border: `2px solid #6b5836`,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(107,88,54,0.05) 0 1px, transparent 1px 8px)',
        }}
      >
        <div style={{fontFamily: bebas, fontSize: 28, color: '#6b5836', letterSpacing: 6, marginBottom: 16, textAlign: 'center'}}>
          ✦ TELEGRAM ✦
        </div>
        <div style={{fontFamily: courier, fontSize: 44, color: '#3d2f1a', textAlign: 'center', lineHeight: 1.3}}>
          {text.slice(0, visible)}
        </div>
      </div>
      <Label text="DEMO 16 · Telegrama vintage (papel)" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// COMPOSITION
// ─────────────────────────────────────────────
const D = 7 * 30;
export const DemoGallery2: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={D * 0} durationInFrames={D}><Demo7 /></Sequence>
    <Sequence from={D * 1} durationInFrames={D}><Demo8 /></Sequence>
    <Sequence from={D * 2} durationInFrames={D}><Demo9 /></Sequence>
    <Sequence from={D * 3} durationInFrames={D}><Demo10 /></Sequence>
    <Sequence from={D * 4} durationInFrames={D}><Demo11 /></Sequence>
    <Sequence from={D * 5} durationInFrames={D}><Demo12 /></Sequence>
    <Sequence from={D * 6} durationInFrames={D}><Demo13 /></Sequence>
    <Sequence from={D * 7} durationInFrames={D}><Demo14 /></Sequence>
    <Sequence from={D * 8} durationInFrames={D}><Demo15 /></Sequence>
    <Sequence from={D * 9} durationInFrames={D}><Demo16 /></Sequence>
  </AbsoluteFill>
);
