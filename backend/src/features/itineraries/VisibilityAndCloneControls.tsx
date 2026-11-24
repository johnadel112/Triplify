import React from 'react';

interface Props {
  isPublic: boolean;
  onTogglePublic: (isPublic: boolean) => void;
  onClone?: () => void;
  canClone?: boolean;
}

export const VisibilityAndCloneControls: React.FC<Props> = ({
  isPublic,
  onTogglePublic,
  onClone,
  canClone,
}) => (
  <div>
    <label>
      <input
        type="checkbox"
        checked={isPublic}
        onChange={(e) => onTogglePublic(e.target.checked)}
      />
      Public Itinerary
    </label>

    {canClone && onClone && (
      <button type="button" onClick={onClone}>
        Clone Itinerary
      </button>
    )}
  </div>
);