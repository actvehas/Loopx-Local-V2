/**
 * Demos.tsx — Galeria de exemplos de animações de texto/grafismo
 * Cada demo: 7 segundos · 1280x720
 * Para preview rápido sem render do vídeo completo.
 */
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Caveat';
import {loadFont as loadBebas} from '@remotion/google-fonts/BebasNeue';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';

const {fontFamily: caveat} = loadFont();
const {fontFamily: bebas} = loadBebas();
const {fontFamily: inter} = loadInter();

const PAPER = '#F5F0E0';
const GRAPHITE = '#222';
const PENCIL_RED = '#D44600';
const PENCIL_BLUE = '#1E4D7B';

// ─────────────────────────────────────────────
// DEMO 1: Bounce-in word reveal (Spring)
// ─────────────────────────────────────────────
const Demo1: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = ['No', 'juzgues', '—', 'es', 'mentira'];
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center'}}>
        {words.map((w, i) => {
          const startFrame = i * 12;
          const s = spring({frame: frame - startFrame, fps, config: {damping: 8, stiffness: 100}});
          return (
            <span
              key={i}
              style={{
                fontFamily: caveat,
                fontSize: 80,
                fontWeight: 700,
                color: i === 1 || i === 4 ? PENCIL_RED : GRAPHITE,
                transform: `translateY(${(1 - s) * 50}px) scale(${s})`,
                opacity: s,
              }}
            >
              {w}
            </span>
          );
        })}
      </div>
      <div style={{position: 'absolute', bottom: 30, fontFamily: inter, fontSize: 18, color: '#888'}}>
        DEMO 1 · Bounce-in spring
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 2: Stroke text (letra sendo desenhada)
// ─────────────────────────────────────────────
const Demo2: React.FC = () => {
  const frame = useCurrentFrame();
  const text = 'JUZGAD';
  const progress = interpolate(frame, [0, 90], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{position: 'relative'}}>
        <span
          style={{
            fontFamily: bebas,
            fontSize: 180,
            color: 'transparent',
            WebkitTextStroke: `4px ${GRAPHITE}`,
            letterSpacing: 8,
          }}
        >
          {text}
        </span>
        <span
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            fontFamily: bebas,
            fontSize: 180,
            color: GRAPHITE,
            letterSpacing: 8,
            clipPath: `inset(0 ${(1 - progress) * 100}% 0 0)`,
          }}
        >
          {text}
        </span>
      </div>
      <div style={{position: 'absolute', bottom: 30, fontFamily: inter, fontSize: 18, color: '#888'}}>
        DEMO 2 · Stroke text revelando
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 3: Highlight scribble (sublinhado/circulo)
// ─────────────────────────────────────────────
const Demo3: React.FC = () => {
  const frame = useCurrentFrame();
  const lineProgress = interpolate(frame, [25, 60], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const circleProgress = interpolate(frame, [60, 110], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{position: 'relative', display: 'flex', gap: '0.8rem'}}>
        <span style={{fontFamily: caveat, fontSize: 80, fontWeight: 700, color: GRAPHITE}}>
          Sin
        </span>
        <div style={{position: 'relative'}}>
          <span style={{fontFamily: caveat, fontSize: 80, fontWeight: 700, color: GRAPHITE}}>
            obras
          </span>
          {/* Sublinhado rabiscado */}
          <svg
            style={{position: 'absolute', left: -10, bottom: -10, width: 220, height: 30, pointerEvents: 'none'}}
            viewBox="0 0 220 30"
          >
            <path
              d="M 5 20 Q 60 8 120 18 T 215 15"
              stroke={PENCIL_RED}
              strokeWidth={5}
              fill="none"
              strokeLinecap="round"
              strokeDasharray="500"
              strokeDashoffset={(1 - lineProgress) * 500}
            />
          </svg>
        </div>
        <span style={{fontFamily: caveat, fontSize: 80, fontWeight: 700, color: GRAPHITE}}>
          de
        </span>
        <div style={{position: 'relative'}}>
          <span style={{fontFamily: caveat, fontSize: 80, fontWeight: 700, color: GRAPHITE}}>
            ley
          </span>
          {/* Círculo rabiscado */}
          <svg
            style={{position: 'absolute', left: -25, top: -10, width: 130, height: 110, pointerEvents: 'none'}}
            viewBox="0 0 130 110"
          >
            <ellipse
              cx={65}
              cy={55}
              rx={55}
              ry={45}
              stroke={PENCIL_RED}
              strokeWidth={5}
              fill="none"
              strokeDasharray="350"
              strokeDashoffset={(1 - circleProgress) * 350}
              transform="rotate(-3 65 55)"
            />
          </svg>
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 30, fontFamily: inter, fontSize: 18, color: '#888'}}>
        DEMO 3 · Highlight scribble (sublinha + círculo)
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 4: Lower third callout (versículo deslizando)
// ─────────────────────────────────────────────
const Demo4: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const slideIn = spring({frame: frame - 10, fps, config: {damping: 20, stiffness: 80}});
  const slideOut = interpolate(frame, [180, 210], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const x = (1 - slideIn) * -600 + slideOut * 600;
  return (
    <AbsoluteFill style={{backgroundColor: PAPER}}>
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: 60,
          right: 60,
          transform: `translateX(${x}px)`,
        }}
      >
        <div
          style={{
            backgroundColor: GRAPHITE,
            padding: '24px 36px',
            borderRadius: 8,
            color: PAPER,
          }}
        >
          <div style={{fontFamily: bebas, fontSize: 36, letterSpacing: 4, color: PENCIL_RED}}>
            EFESIOS 2:8-9
          </div>
          <div style={{fontFamily: caveat, fontSize: 38, marginTop: 8}}>
            "Por gracia sois salvos por medio de la fe"
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', fontFamily: inter, fontSize: 18, color: '#888'}}>
        DEMO 4 · Lower-third callout
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 5: Counter "1/5" anunciando
// ─────────────────────────────────────────────
const Demo5: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const numScale = spring({frame: frame - 10, fps, config: {damping: 6, stiffness: 120}});
  const labelOp = interpolate(frame, [30, 50], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 12}}>
          <span
            style={{
              fontFamily: bebas,
              fontSize: 240,
              fontWeight: 700,
              color: PENCIL_RED,
              transform: `scale(${numScale})`,
              lineHeight: 1,
            }}
          >
            1
          </span>
          <span style={{fontFamily: bebas, fontSize: 80, color: GRAPHITE, opacity: 0.4}}>
            / 5
          </span>
        </div>
        <div
          style={{
            fontFamily: caveat,
            fontSize: 56,
            color: GRAPHITE,
            opacity: labelOp,
            transform: `translateY(${(1 - labelOp) * 30}px)`,
          }}
        >
          La salvación se gana con obras
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 30, fontFamily: inter, fontSize: 18, color: '#888'}}>
        DEMO 5 · Counter anúncio de bloco
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 6: Quote callout grande (versículo flutuante)
// ─────────────────────────────────────────────
const Demo6: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cardIn = spring({frame: frame - 10, fps, config: {damping: 15, stiffness: 90}});
  const verseIn = interpolate(frame, [40, 100], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fullVerse = '"Acerquémonos confiadamente al trono de la gracia"';
  const visible = Math.floor(verseIn * fullVerse.length);
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <div
        style={{
          backgroundColor: 'white',
          border: `3px solid ${GRAPHITE}`,
          borderRadius: 14,
          padding: '40px 60px',
          maxWidth: 900,
          textAlign: 'center',
          boxShadow: `8px 8px 0 ${GRAPHITE}`,
          transform: `scale(${cardIn}) rotate(${(1 - cardIn) * -2}deg)`,
        }}
      >
        <div style={{fontFamily: bebas, fontSize: 28, letterSpacing: 6, color: PENCIL_RED, marginBottom: 16}}>
          HEBREOS 4:16
        </div>
        <div style={{fontFamily: caveat, fontSize: 48, color: GRAPHITE, lineHeight: 1.3}}>
          {fullVerse.slice(0, visible)}
          <span style={{opacity: visible < fullVerse.length ? 1 : 0}}>|</span>
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 30, fontFamily: inter, fontSize: 18, color: '#888'}}>
        DEMO 6 · Quote callout grande
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// COMPOSITION GALLERY (concatena todos)
// ─────────────────────────────────────────────
const DEMO_LEN = 7 * 30; // 7s × 30fps

export const DemoGallery: React.FC = () => {
  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={DEMO_LEN}><Demo1 /></Sequence>
      <Sequence from={DEMO_LEN * 1} durationInFrames={DEMO_LEN}><Demo2 /></Sequence>
      <Sequence from={DEMO_LEN * 2} durationInFrames={DEMO_LEN}><Demo3 /></Sequence>
      <Sequence from={DEMO_LEN * 3} durationInFrames={DEMO_LEN}><Demo4 /></Sequence>
      <Sequence from={DEMO_LEN * 4} durationInFrames={DEMO_LEN}><Demo5 /></Sequence>
      <Sequence from={DEMO_LEN * 5} durationInFrames={DEMO_LEN}><Demo6 /></Sequence>
    </AbsoluteFill>
  );
};
