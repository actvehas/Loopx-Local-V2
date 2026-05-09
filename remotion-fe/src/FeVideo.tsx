import {AbsoluteFill, Audio, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Caveat';
import {Caption} from './Caption';

const {fontFamily} = loadFont();

type Word = {
  word: string;
  start: number;
  end: number;
};

type Scene = {
  num: number;
  start: number;
  end: number;
  // Onde posicionar o texto durante essa cena: 'top' | 'bottom' | 'center'
  // Default 'bottom' — funciona pra maioria das cenas (sketch tem personagem central)
  textZone?: 'top' | 'bottom' | 'center';
};

type Props = {
  videoSrc: string;
  audioSrc: string;
  words: Word[];
  scenes: Scene[];
};

export const FeVideo: React.FC<Props> = ({videoSrc, audioSrc, words, scenes}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps; // tempo atual em segundos

  // Encontra a cena ativa
  const currentScene = scenes.find((s) => t >= s.start && t < s.end);
  const zone = currentScene?.textZone || 'bottom';

  // Janela de palavras: as últimas 5-7 palavras já faladas + a próxima sendo dita
  // Pra ficar tipo karaoke moderno (TikTok / Mr Beast)
  const WINDOW_BACK = 0.8; // segundos para trás
  const WINDOW_FWD = 2.5; // segundos para frente

  const visibleWords = words.filter(
    (w) => w.start <= t + WINDOW_FWD && w.end >= t - WINDOW_BACK
  );

  // A palavra "ativa" — a que está sendo falada agora
  const activeIdx = visibleWords.findIndex((w) => t >= w.start && t < w.end);

  return (
    <AbsoluteFill style={{backgroundColor: '#F5F0E0'}}>
      {videoSrc ? (
        <OffthreadVideo src={staticFile(videoSrc)} muted />
      ) : null}
      {audioSrc ? <Audio src={staticFile(audioSrc)} /> : null}

      <Caption
        words={visibleWords}
        activeIdx={activeIdx}
        zone={zone}
        fontFamily={fontFamily}
        currentTime={t}
      />
    </AbsoluteFill>
  );
};
