/**
 * Demos3.tsx — Variações de ENTRADA em estilo sketch puro
 * Cada demo: 7s · 1280x720
 * Paleta restrita: cream paper #F5F0E0 + graphite #222 + pencil-red #D44600 (acentos)
 */
import React from 'react';
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont as loadCaveat} from '@remotion/google-fonts/Caveat';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadShadowsIntoLight} from '@remotion/google-fonts/ShadowsIntoLight';
import {loadFont as loadKalam} from '@remotion/google-fonts/Kalam';
import {loadFont as loadPatrickHand} from '@remotion/google-fonts/PatrickHand';

const {fontFamily: caveat} = loadCaveat();
const {fontFamily: inter} = loadInter();
const {fontFamily: shadows} = loadShadowsIntoLight();
const {fontFamily: kalam} = loadKalam();
const {fontFamily: patrick} = loadPatrickHand();

const PAPER = '#F5F0E0';
const GRAPHITE = '#222';
const PENCIL_RED = '#D44600';

const Label: React.FC<{text: string}> = ({text}) => (
  <div style={{position: 'absolute', bottom: 30, left: 0, right: 0, textAlign: 'center', fontFamily: inter, fontSize: 18, color: '#888'}}>
    {text}
  </div>
);

// Paper grain overlay (sutil)
const PaperGrain: React.FC = () => (
  <svg style={{position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06}} width="100%" height="100%">
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" />
      <feColorMatrix type="matrix" values="0 0 0 0 0.13  0 0 0 0 0.13  0 0 0 0 0.13  0 0 0 1 0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#noise)" />
  </svg>
);

// ─────────────────────────────────────────────
// DEMO 17: Caneta escrevendo letra por letra (stroke draw)
// ─────────────────────────────────────────────
const Demo17: React.FC = () => {
  const frame = useCurrentFrame();
  const text = 'No juzgues';
  const visible = Math.min(text.length, Math.floor(frame / 5));
  const cursor = Math.floor(frame / 6) % 2 === 0 && visible < text.length;
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{fontFamily: caveat, fontSize: 110, fontWeight: 700, color: GRAPHITE, letterSpacing: 2}}>
        {text.slice(0, visible)}
        <span style={{opacity: cursor ? 1 : 0, color: PENCIL_RED}}>|</span>
      </div>
      <Label text="DEMO 17 · Caneta escrevendo (typewriter handwritten)" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 18: Word emergindo de scribble cloud
// ─────────────────────────────────────────────
const Demo18: React.FC = () => {
  const frame = useCurrentFrame();
  const wordOpacity = interpolate(frame, [30, 70], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const scribbleOp = interpolate(frame, [0, 30, 70, 100], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{position: 'relative'}}>
        {/* Scribble cloud */}
        <svg style={{position: 'absolute', left: -50, top: -40, opacity: scribbleOp}} width={600} height={200} viewBox="0 0 600 200">
          {Array.from({length: 30}).map((_, i) => (
            <line
              key={i}
              x1={Math.random() * 600}
              y1={Math.random() * 200}
              x2={Math.random() * 600}
              y2={Math.random() * 200}
              stroke={GRAPHITE}
              strokeWidth={1.5}
              opacity={0.3 + Math.random() * 0.4}
            />
          ))}
        </svg>
        <div style={{fontFamily: kalam, fontSize: 100, fontWeight: 700, color: GRAPHITE, opacity: wordOpacity}}>
          La verdad
        </div>
      </div>
      <Label text="DEMO 18 · Emergindo de scribble cloud" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 19: Box drawing around word (caixa rabiscada)
// ─────────────────────────────────────────────
const Demo19: React.FC = () => {
  const frame = useCurrentFrame();
  const drawProgress = interpolate(frame, [10, 80], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const wordOp = interpolate(frame, [60, 90], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{position: 'relative', padding: '40px 70px'}}>
        <svg style={{position: 'absolute', inset: 0, pointerEvents: 'none'}} viewBox="0 0 800 280" preserveAspectRatio="none">
          <path
            d="M 20 20 L 780 20 L 780 260 L 20 260 Z"
            fill="none"
            stroke={GRAPHITE}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="2080"
            strokeDashoffset={(1 - drawProgress) * 2080}
            style={{filter: 'url(#rough)'}}
          />
          <filter id="rough">
            <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" />
            <feDisplacementMap in="SourceGraphic" scale="3" />
          </filter>
        </svg>
        <div style={{fontFamily: caveat, fontSize: 90, fontWeight: 700, color: GRAPHITE, opacity: wordOp}}>
          Mentira
        </div>
      </div>
      <Label text="DEMO 19 · Caixa rabiscada desenhando" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 20: Sketch arrow drawing in pointing
// ─────────────────────────────────────────────
const Demo20: React.FC = () => {
  const frame = useCurrentFrame();
  const arrowProgress = interpolate(frame, [15, 65], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{display: 'flex', alignItems: 'center', gap: 40}}>
        <svg width={280} height={120} viewBox="0 0 280 120">
          <path
            d="M 20 60 Q 80 30 150 60 Q 200 80 240 60 L 230 50 M 240 60 L 230 70"
            stroke={GRAPHITE}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="350"
            strokeDashoffset={(1 - arrowProgress) * 350}
          />
        </svg>
        <div style={{fontFamily: shadows, fontSize: 110, color: PENCIL_RED, fontWeight: 700}}>
          AQUÍ
        </div>
      </div>
      <Label text="DEMO 20 · Seta rabiscada apontando" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 21: Notebook page corner reveal
// ─────────────────────────────────────────────
const Demo21: React.FC = () => {
  const frame = useCurrentFrame();
  const slideX = interpolate(frame, [0, 50], [-1280, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const rot = interpolate(frame, [0, 50], [-12, -2], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: '#3d3526', justifyContent: 'center', alignItems: 'center', overflow: 'hidden'}}>
      <div
        style={{
          backgroundColor: PAPER,
          padding: '60px 90px',
          boxShadow: '12px 18px 40px rgba(0,0,0,0.4)',
          transform: `translateX(${slideX}px) rotate(${rot}deg)`,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(180,140,60,0.12) 0 1px, transparent 1px 28px)',
          minWidth: 700,
          textAlign: 'center',
        }}
      >
        <div style={{fontFamily: patrick, fontSize: 56, color: GRAPHITE, lineHeight: 1.3}}>
          Lo que tu pastor<br />no quiere que leas
        </div>
      </div>
      <Label text="DEMO 21 · Página de caderno deslizando" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 22: Eraser swipe revealing word
// ─────────────────────────────────────────────
const Demo22: React.FC = () => {
  const frame = useCurrentFrame();
  const swipe = interpolate(frame, [10, 80], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{position: 'relative'}}>
        {/* Hatching covering */}
        <svg style={{position: 'absolute', inset: 0, opacity: 0.95, clipPath: `inset(0 0 0 ${swipe * 100}%)`}} width={800} height={150} viewBox="0 0 800 150">
          {Array.from({length: 80}).map((_, i) => (
            <line key={i} x1={i * 12} y1={0} x2={i * 12 - 30} y2={150} stroke={GRAPHITE} strokeWidth={1.2} />
          ))}
        </svg>
        <div style={{fontFamily: caveat, fontSize: 100, fontWeight: 700, color: GRAPHITE, padding: '20px 40px'}}>
          Confesional Verdad
        </div>
      </div>
      <Label text="DEMO 22 · Borracha apagando o hachurado (revelar)" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 23: Doodle stars exploding around
// ─────────────────────────────────────────────
const Demo23: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const wordPop = spring({frame: frame - 15, fps, config: {damping: 8, stiffness: 140}});
  const stars = Array.from({length: 12}).map((_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const dist = interpolate(frame, [25, 70], [0, 200 + Math.random() * 60], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const op = interpolate(frame, [25, 50, 90], [0, 1, 0.4], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    const types = ['✦', '✧', '★', '*', '+'];
    const ch = types[i % types.length];
    return (
      <span
        key={i}
        style={{
          position: 'absolute',
          fontSize: 50,
          color: GRAPHITE,
          opacity: op,
          transform: `translate(${x}px, ${y}px) rotate(${i * 30}deg)`,
          fontFamily: 'serif',
        }}
      >
        {ch}
      </span>
    );
  });
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{position: 'relative'}}>
        {stars}
        <div
          style={{
            fontFamily: kalam,
            fontSize: 120,
            fontWeight: 700,
            color: PENCIL_RED,
            transform: `scale(${wordPop})`,
          }}
        >
          ¡Eureka!
        </div>
      </div>
      <Label text="DEMO 23 · Doodle stars explodindo" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 24: Pencil shading hatching reveal
// ─────────────────────────────────────────────
const Demo24: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [10, 80], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{position: 'relative'}}>
        <div
          style={{
            fontFamily: caveat,
            fontSize: 130,
            fontWeight: 700,
            color: GRAPHITE,
            backgroundImage: `repeating-linear-gradient(45deg, rgba(34,34,34,${reveal * 0.8}) 0 2px, transparent 2px 8px)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            opacity: reveal,
          }}
        >
          Apartaos
        </div>
      </div>
      <Label text="DEMO 24 · Hachurado sombreado revelando palavra" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 25: Multi-line word wave (cada letra com delay onda)
// ─────────────────────────────────────────────
const Demo25: React.FC = () => {
  const frame = useCurrentFrame();
  const text = 'Levántate';
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{display: 'flex'}}>
        {text.split('').map((ch, i) => {
          const wave = Math.sin((frame - i * 6) / 8) * 12;
          const op = interpolate(frame, [i * 4, i * 4 + 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          return (
            <span
              key={i}
              style={{
                fontFamily: kalam,
                fontSize: 130,
                fontWeight: 700,
                color: GRAPHITE,
                transform: `translateY(${wave}px)`,
                opacity: op,
                display: 'inline-block',
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
      <Label text="DEMO 25 · Onda sinusoidal nas letras" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// DEMO 26: Thought-bubble (nuvem de pensamento sketch)
// ─────────────────────────────────────────────
const Demo26: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const cloudIn = spring({frame: frame - 10, fps, config: {damping: 14, stiffness: 100}});
  return (
    <AbsoluteFill style={{backgroundColor: PAPER, justifyContent: 'center', alignItems: 'center'}}>
      <PaperGrain />
      <div style={{position: 'relative', transform: `scale(${cloudIn})`}}>
        <svg width={900} height={400} viewBox="0 0 900 400">
          {/* Thought bubble cloud */}
          <path
            d="M 100 200
               Q 50 150, 100 100
               Q 100 50, 180 70
               Q 220 30, 300 60
               Q 380 30, 460 60
               Q 540 30, 620 60
               Q 700 30, 760 80
               Q 850 100, 800 180
               Q 870 240, 780 280
               Q 800 350, 700 340
               Q 600 380, 500 350
               Q 400 380, 300 350
               Q 200 380, 150 320
               Q 80 300, 100 240
               Z"
            fill="white"
            stroke={GRAPHITE}
            strokeWidth={5}
            strokeLinejoin="round"
          />
          {/* Tail bubbles */}
          <circle cx={130} cy={360} r={20} fill="white" stroke={GRAPHITE} strokeWidth={4} />
          <circle cx={90} cy={395} r={12} fill="white" stroke={GRAPHITE} strokeWidth={3} />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '0 100px',
          }}
        >
          <div style={{fontFamily: patrick, fontSize: 56, color: GRAPHITE, textAlign: 'center', lineHeight: 1.3}}>
            ¿Y si todo lo que<br />creías fuera mentira?
          </div>
        </div>
      </div>
      <Label text="DEMO 26 · Nuvem de pensamento sketch" />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// COMPOSITION
// ─────────────────────────────────────────────
const D = 7 * 30;
export const DemoGallery3: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={D * 0} durationInFrames={D}><Demo17 /></Sequence>
    <Sequence from={D * 1} durationInFrames={D}><Demo18 /></Sequence>
    <Sequence from={D * 2} durationInFrames={D}><Demo19 /></Sequence>
    <Sequence from={D * 3} durationInFrames={D}><Demo20 /></Sequence>
    <Sequence from={D * 4} durationInFrames={D}><Demo21 /></Sequence>
    <Sequence from={D * 5} durationInFrames={D}><Demo22 /></Sequence>
    <Sequence from={D * 6} durationInFrames={D}><Demo23 /></Sequence>
    <Sequence from={D * 7} durationInFrames={D}><Demo24 /></Sequence>
    <Sequence from={D * 8} durationInFrames={D}><Demo25 /></Sequence>
    <Sequence from={D * 9} durationInFrames={D}><Demo26 /></Sequence>
  </AbsoluteFill>
);
