import type { Entity } from '@/types';

const A_CODE = 'A'.charCodeAt(0);
const Z_CODE = 'Z'.charCodeAt(0);

function letterValue(ch: string): number {
  const code = ch.toUpperCase().charCodeAt(0);
  if (code < A_CODE || code > Z_CODE) return 0;
  return code - A_CODE + 1;
}

function reverseLetterValue(ch: string): number {
  const code = ch.toUpperCase().charCodeAt(0);
  if (code < A_CODE || code > Z_CODE) return 0;
  return Z_CODE - code + 1;
}

function reduceToSingle(n: number): number {
  if (n === 0) return 0;
  let value = n;
  while (value > 9) {
    value = value.toString().split('').reduce((acc, d) => acc + Number(d), 0);
  }
  return value;
}

function parseDateParts(dateStr: string): { month: number; day: number; year: number } | null {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { month, day, year };
}

export function gematria(phrase: string) {
  const chars = [...phrase].filter((ch) => /[a-z]/i.test(ch));
  const ordinal = chars.reduce((acc, ch) => acc + letterValue(ch), 0);
  const full_reduction = chars.reduce((acc, ch) => acc + reduceToSingle(letterValue(ch)), 0);
  const reverse_ordinal = chars.reduce((acc, ch) => acc + reverseLetterValue(ch), 0);
  const reverse_full_reduction = chars.reduce((acc, ch) => acc + reduceToSingle(reverseLetterValue(ch)), 0);
  return { ordinal, full_reduction, reverse_ordinal, reverse_full_reduction };
}

export function dateNumerologyFromIso(dateStr: string) {
  const parts = parseDateParts(dateStr);
  if (!parts) return null;
  const { month, day, year } = parts;
  const yy = year % 100;
  const mmdd = Number(`${month}${day}`);
  const mmddyy = Number(`${month}${day}${yy.toString().padStart(2, '0')}`);
  const sum_full = month + day + year;
  const sum_short = month + day + yy;
  const sum_month_day = month + day;
  const dayOfWeek = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return {
    sum_full,
    sum_short,
    sum_month_day,
    concat_mmdd: mmdd,
    concat_mmddyy: mmddyy,
    day_of_week: dayOfWeek,
    day,
    month,
    year_short: yy,
  };
}

export function numerologyValuesForEntity(entity: Entity): number[] {
  const values = new Set<number>();
  const g = gematria(entity.name);
  values.add(g.ordinal);
  values.add(g.full_reduction);
  values.add(g.reverse_ordinal);
  values.add(g.reverse_full_reduction);
  for (const dateStr of [entity.birth_date, entity.death_date, entity.founded_date, entity.ended_date]) {
    if (!dateStr) continue;
    const d = dateNumerologyFromIso(dateStr);
    if (!d) continue;
    values.add(d.sum_full);
    values.add(d.sum_short);
    values.add(d.sum_month_day);
    values.add(d.concat_mmdd);
    values.add(d.concat_mmddyy);
    values.add(d.day);
    values.add(d.month);
    values.add(d.year_short);
  }
  return [...values].filter((v) => Number.isFinite(v));
}
