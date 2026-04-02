import React, { useRef, useEffect, useState, useCallback } from 'react';
import { HUD } from './HUD';
import { createScene, InputState } from '../utils/scene';
import { GameState, MazeSizeConfig } from '../types';

interface GameProps {
  config: MazeSizeConfig;
  onBack?: () => void;
}

export const Game: React.FC<GameProps> = ({ config, onBack }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<InputState>({ x: 0, z: 0 });
  const [gameState, setGameState] = useState<GameState>({ distance: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cleanup = createScene(
      el,
      inputRef.current,
      (s: GameState) => setGameState(s),
      config
    );
    return cleanup;
  }, [config]);

  const handleJoystick = useCallback((x: number, z: number) => {
    inputRef.current.x = x;
    inputRef.current.z = z;
  }, []);

  return (
    <div className="game-container">
      <div ref={containerRef} className="canvas-container" />
      <HUD gameState={gameState} onJoystick={handleJoystick} onBack={onBack} />
    </div>
  );
};
