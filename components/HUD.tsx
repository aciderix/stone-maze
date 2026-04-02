import React, { useRef, useCallback, useState } from 'react';
import { GameState } from '../types';

interface JoystickProps {
  onMove: (x: number, z: number) => void;
}

const JOYSTICK_SIZE = 130;
const KNOB_SIZE = 50;
const MAX_DIST = (JOYSTICK_SIZE - KNOB_SIZE) / 2;

const Joystick: React.FC<JoystickProps> = ({ onMove }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const touchIdRef = useRef<number | null>(null);

  const getOffset = useCallback((clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return { x: 0, y: 0 };
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > MAX_DIST) {
      dx = (dx / dist) * MAX_DIST;
      dy = (dy / dist) * MAX_DIST;
    }
    return { x: dx, y: dy };
  }, []);

  const handleStart = useCallback((clientX: number, clientY: number, pointerId?: number) => {
    if (pointerId !== undefined) touchIdRef.current = pointerId;
    setActive(true);
    const off = getOffset(clientX, clientY);
    setKnobPos(off);
    onMove(off.x / MAX_DIST, -off.y / MAX_DIST);
  }, [getOffset, onMove]);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    const off = getOffset(clientX, clientY);
    setKnobPos(off);
    onMove(off.x / MAX_DIST, -off.y / MAX_DIST);
  }, [getOffset, onMove]);

  const handleEnd = useCallback(() => {
    touchIdRef.current = null;
    setActive(false);
    setKnobPos({ x: 0, y: 0 });
    onMove(0, 0);
  }, [onMove]);

  return (
    <div
      ref={baseRef}
      className={`joystick-base ${active ? 'joystick-active' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        handleStart(e.clientX, e.clientY, e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!active) return;
        e.preventDefault();
        handleMove(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        handleEnd();
      }}
      onPointerCancel={() => handleEnd()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="joystick-knob"
        style={{
          transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
        }}
      />
    </div>
  );
};

/* ─── Pause Modal ─── */
interface PauseModalProps {
  onClose: () => void;
  onMenu: () => void;
}

const PauseModal: React.FC<PauseModalProps> = ({ onClose, onMenu }) => (
  <div className="pause-overlay" onClick={onClose}>
    <div className="pause-modal" onClick={(e) => e.stopPropagation()}>
      <button className="pause-modal-btn" onClick={onMenu}>
        ◀ Retour au menu
      </button>
    </div>
  </div>
);

/* ─── HUD ─── */
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
