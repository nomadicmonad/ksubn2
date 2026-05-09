'use client';

import { StarToggleButton } from './StarToggleButton';

interface StarButtonProps {
  entityId: string;
  initialStarred: boolean;
  size?: 'sm' | 'md';
}

export function StarButton({ entityId, initialStarred, size = 'md' }: StarButtonProps) {
  return (
    <StarToggleButton kind="entity" targetId={entityId} initialStarred={initialStarred} size={size} label />
  );
}
