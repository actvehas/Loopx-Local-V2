import React from 'react';
import {interpolate} from 'remotion';

type Word = {
  word: string;
  start: number;
  end: number;
};

type Props = {
  words: Word[];
  activeIdx: number;
  zone: 'top' | 'bottom' | 'center';
  fontFamily: string;
  currentTime: number;
};

// Posicionamento safe-zone baseado em zone do scene-map.
// O sketch sempre tem personagem ou Bíblia central — bottom é o mais seguro.
const positionStyles: Record<Props['zone'], React.CSSProperties> = {
  top: {top: 60, bottom: 'auto'},
  bottom: {bottom: 80, top: 'auto'},
  center: {top: '50%', transform: 'translateY(-50%)'},
};

export const Caption: React.FC<Props> = ({words, activeIdx, zone, fontFamily, currentTime}) => {
  if (words.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: '8%',
        right: '8%',
        ...positionStyles[zone],
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '0.4rem',
        pointerEvents: 'none',
      }}
    >
      {words.map((w, i) => {
        const isActive = i === activeIdx;
        const wasSpoken = currentTime >= w.end;
        const willSpeak = currentTime < w.start;

        // Animação de entrada na palavra ativa
        const activeProgress = isActive
          ? interpolate(currentTime, [w.start, w.start + 0.12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          : 1;

        // Estilo: handwriting cursivo (Caveat) — combina com sketch
        // Cor: graphite (#222) sobre paper-tone
        // Active: amarelo destaque + scale up sutil
        // Spoken: graphite normal
        // Not yet spoken: cinza claro semitransparente
        const color = isActive
          ? '#D44600' // laranja destaque (pencil-marked)
          : wasSpoken
          ? '#222222' // graphite
          : 'rgba(80,80,80,0.45)'; // cinza pré-fala

        const scale = isActive ? 1 + 0.08 * activeProgress : 1;

        const fontSize = isActive ? 56 : 48;

        return (
          <span
            key={`${w.start}-${i}`}
            style={{
              fontFamily,
              fontSize,
              fontWeight: 700,
              color,
              transform: `scale(${scale})`,
              transition: 'color 0.06s linear',
              // Halo legível sobre fundo cream sketch
              textShadow:
                '0 0 6px rgba(245,240,224,0.85), 0 0 12px rgba(245,240,224,0.6), 1px 1px 0 rgba(255,255,255,0.7)',
              padding: '0 4px',
              lineHeight: 1.1,
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
