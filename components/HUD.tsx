import React, { useState } from 'react';
import { GameState } from '../types';
import { Joystick } from './Joystick';
import { PauseModal } from './PauseModal';

interface HUDProps {
  gameState: GameState;
  onJoystick: (x: number, z: number) => void;
  onBack?: () => void;
}

export const HUD: React.FC<HUDProps> = ({ gameState, onJoystick, onBack }) => {
  const [paused, setPaused] = useState(false);

  return (
    <div className="hud">
      {paused && onBack && (
        <PauseModal
          onClose={() => setPaused(false)}
          onMenu={onBack}
        />
      )}
      <div className="hud-bottom">
        <button
          className="hud-pause-btn"
          onClick={() => setPaused(true)}
          title="Pause"
        >
          <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
            <rect x="2" y="1" width="16" height="2.5" rx="1.25" fill="#ffeedd"/>
            <rect x="2" y="6.75" width="16" height="2.5" rx="1.25" fill="#ffeedd"/>
            <rect x="2" y="12.5" width="16" height="2.5" rx="1.25" fill="#ffeedd"/>
          </svg>
        </button>
        <Joystick onMove={onJoystick} />
        <div className="hud-distance-compact">
          <span className="dist-value">{gameState.distance}</span>
          <span className="dist-unit">m</span>
        </div>
      </div>
    </div>
  );
};
