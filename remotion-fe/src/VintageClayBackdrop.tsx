import {AbsoluteFill} from 'remotion';

/**
 * Format v6 Vintage Clay
 * Terracotta #b56b3e + grão sépia + papel envelhecido + vinheta marrom-escura
 */
export const VintageClayBackdrop: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#b56b3e'}}>
      {/* Texture sépia */}
      <svg
        width="100%"
        height="100%"
        style={{position: 'absolute', inset: 0, opacity: 0.42, mixBlendMode: 'multiply'}}
      >
        <defs>
          <filter id="claynoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="2" seed="9" />
            <feColorMatrix values="0 0 0 0 0.18   0 0 0 0 0.10   0 0 0 0 0.05   0 0 0 1 0" />
          </filter>
          <filter id="claysplotch">
            <feTurbulence type="turbulence" baseFrequency="0.012" numOctaves="3" seed="22" />
            <feColorMatrix values="0 0 0 0 0.45   0 0 0 0 0.22   0 0 0 0 0.10   0 0 0 0.55 0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#claynoise)" opacity="0.6" />
        <rect width="100%" height="100%" filter="url(#claysplotch)" opacity="0.55" />
      </svg>

      {/* Vinheta marrom-escura nas bordas */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 38%, rgba(40,18,8,0.7) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
