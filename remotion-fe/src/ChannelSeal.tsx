import {AbsoluteFill, staticFile} from 'remotion';

type Props = {
  position?: 'top-right' | 'bottom-left';
  opacity?: number;
  size?: number;
};

export const ChannelSeal: React.FC<Props> = ({
  position = 'top-right',
  opacity = 0.7,
  size = 77,
}) => {
  // size 77 = ~6% of 1280 (composition width)
  const pos =
    position === 'top-right'
      ? {top: 24, right: 24}
      : {bottom: 24, left: 24};
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <img
        src={staticFile('logo/ID.png')}
        alt="Fe al Descubierto"
        style={{
          position: 'absolute',
          width: size,
          height: 'auto',
          opacity,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.25))',
          ...pos,
        }}
      />
    </AbsoluteFill>
  );
};
