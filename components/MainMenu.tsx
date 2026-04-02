import React, { useRef, useEffect } from 'react';
import { createMenuScene } from '../utils/scene';
import { MazeSizeId } from '../types';

interface MainMenuProps {
  onPlay: (size: MazeSizeId) => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onPlay }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    return createMenuScene(el);
  }, []);

  return (
    <div className="menu-container">
      <div ref={containerRef} className="menu-bg" />
      <div className="menu-overlay">
        <div className="menu-content">
          <h1 className="menu-title">STONE</h1>
          <h1 className="menu-title menu-title-sub">MAZE</h1>
          <div className="menu-modes">
            <button className="mode-btn" onClick={() => onPlay('tutorial')}>
              <span className="mode-icon">📖</span>
              <span className="mode-name">TUTORIEL</span>
              <span className="mode-desc">8×8 — Découvrir le jeu</span>
            </button>
            <button className="mode-btn" onClick={() => onPlay('challenge')}>
              <span className="mode-icon">⚔️</span>
              <span className="mode-name">DÉFI</span>
              <span className="mode-desc">20×20 — Pour les courageux</span>
            </button>
            <button className="mode-btn" onClick={() => onPlay('colossal')}>
              <span className="mode-icon">🏔️</span>
              <span className="mode-name">COLOSSE</span>
              <span className="mode-desc">100×100 — À perte de vue</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
