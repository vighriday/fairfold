export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(instant: string | Date): Clock {
  const milliseconds = new Date(instant).getTime();
  if (!Number.isFinite(milliseconds)) throw new Error('Invalid clock instant');
  return { now: () => new Date(milliseconds) };
}
