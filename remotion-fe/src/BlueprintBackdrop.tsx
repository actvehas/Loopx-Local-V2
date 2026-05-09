import {AbsoluteFill} from 'remotion';

/**
 * Format v5 Blueprint Inverso
 * Fundo azul-escuro + grade técnica + vinheta
 */
export const BlueprintBackdrop: React.FC = () => {
  return (
    <AbsoluteFill style={{backgroundColor: '#0d2840'}}>
      {/* Grade técnica em SVG, opacidade baixa */}
      <svg
        width="100%"
        height="100%"
        style={{position: 'absolute', inset: 0, opacity: 0.18}}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="#5a8fb4"
              strokeWidth="0.6"
            />
          </pattern>
          <pattern
            id="bigGrid"
            width="200"
            height="200"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 200 0 L 0 0 0 200"
              fill="none"
              stroke="#7eb0d4"
              strokeWidth="1.0"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#bigGrid)" />
      </svg>

      {/* Vinheta radial nas bordas */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
