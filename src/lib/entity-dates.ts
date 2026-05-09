import type { Entity } from '@/types';

export function getEntityPrimaryDates(entity: Entity): { label: string; start: string | null; end: string | null } {
  if (entity.type === 'person') {
    return { label: entity.death_date ? 'Life span' : 'Born', start: entity.birth_date, end: entity.death_date };
  }
  if (entity.type === 'event') {
    return { label: entity.ended_date ? 'Event span' : 'Event date', start: entity.founded_date, end: entity.ended_date };
  }
  return { label: entity.ended_date ? 'Active period' : 'Founded', start: entity.founded_date, end: entity.ended_date };
}

export function getEntityDateRows(entity: Entity): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (entity.birth_date) rows.push({ label: 'Birth date', value: entity.birth_date });
  if (entity.death_date) rows.push({ label: 'Death date', value: entity.death_date });
  if (entity.founded_date) rows.push({ label: entity.type === 'event' ? 'Event start' : 'Founded', value: entity.founded_date });
  if (entity.ended_date) rows.push({ label: entity.type === 'event' ? 'Event end' : 'Ended', value: entity.ended_date });
  return rows;
}
