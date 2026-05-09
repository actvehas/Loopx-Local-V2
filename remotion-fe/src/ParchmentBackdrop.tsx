import {AbsoluteFill} from 'remotion';

/**
 * Format v2 Parchment Typewriter
 * Pergamino bege escuro #c9b78a + manchas/grain + vinheta marrom
 */
export const ParchmentBackdrop: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#c9b78a'}}>
      {/* Manchas/textura SVG */}
      <svg
        width="100%"
        height="100%"
        style={{position: 'absolute', inset: 0, opacity: 0.32, mixBlendMode: 'multiply'}}
      >
        <defs>
          <filter id="noise">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="2"
              seed="7"
            />
            <feColorMatrix values="0 0 0 0 0.36   0 0 0 0 0.26   0 0 0 0 0.16   0 0 0 1 0" />
          </filter>
          <filter id="splotch">
            <feTurbulence
              type="turbulence"
              baseFrequency="0.018"
              numOctaves="3"
              seed="12"
            />
            <feColorMatrix values="0 0 0 0 0.30   0 0 0 0 0.20   0 0 0 0 0.10   0 0 0 0.45 0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#noise)" opacity="0.55" />
        <rect width="100%" height="100%" filter="url(#splotch)" opacity="0.7" />
      </svg>

      {/* Vinheta marrom radial */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 45%, rgba(60,38,18,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Linha-margem de caderno antigo (sutil) */}
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 0,
          bottom: 0,
          width: 1,
          background: 'rgba(120,70,30,0.18)',
        }}
      />
    </AbsoluteFill>
  );
};
