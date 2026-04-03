import React from 'react';

/* ─── Pause Modal ─── */
export interface PauseModalProps {
  onClose: () => void;
  onMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({ onClose, onMenu }) => (
  <div className="pause-overlay" onClick={onClose}>
    <div className="pause-modal" onClick={(e) => e.stopPropagation()}>
      <button className="pause-modal-btn" onClick={onMenu}>
        ◀ Retour au menu
      </button>
    </div>
  </div>
);

