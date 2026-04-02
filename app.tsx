import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Game } from './components/Game';
import { MainMenu } from './components/MainMenu';
import { MazeSizeId, MAZE_CONFIGS } from './types';

const App: React.FC = () => {
  const [screen, setScreen] = useState<'menu' | 'playing'>('menu');
  const [sizeId, setSizeId] = useState<MazeSizeId>('tutorial');

  if (screen === 'menu') {
    return (
      <MainMenu
        onPlay={(id: MazeSizeId) => {
          setSizeId(id);
          setScreen('playing');
        }}
      />
    );
  }
  return <Game config={MAZE_CONFIGS[sizeId]} onBack={() => setScreen('menu')} />;
};

createRoot(document.getElementById('root')!).render(<App />);
