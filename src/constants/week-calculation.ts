// Week calculation constants
// Reference date for the end of week 0 - this is when the first leaderboard ended
// Week resets every Friday at 3pm Chile time (UTC-3)
export const WEEK_ZERO_END_DATE = new Date('2023-12-22T18:00:00.000Z');

/**
 * Get current week number using simplified timestamp math
 */
export function getCurrentWeekNumber(): number {
  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const msSinceWeekZeroEnd = now - WEEK_ZERO_END_DATE.getTime();
  const weeksPassed = Math.floor(msSinceWeekZeroEnd / WEEK_MS);
  return Math.max(0, weeksPassed + 1);
}

/**
 * Get start and end dates for a specific week using simplified timestamp math
 */
export function getWeekRange(weekNumber: number): { startDate: Date; endDate: Date } {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  
  // Calculate week start and end timestamps
  const weekStartMs = WEEK_ZERO_END_DATE.getTime() + (weekNumber - 1) * WEEK_MS;
  const weekEndMs = WEEK_ZERO_END_DATE.getTime() + weekNumber * WEEK_MS;

  return {
    startDate: new Date(weekStartMs),
    endDate: new Date(weekEndMs),
  };
}

/**
 * Get which week a given timestamp belongs to
 */
export function getWeekForTimestamp(timestamp: Date | string): number {
  const date = new Date(timestamp);
  const now = date.getTime();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const msSinceWeekZeroEnd = now - WEEK_ZERO_END_DATE.getTime();
  const weeksPassed = Math.floor(msSinceWeekZeroEnd / WEEK_MS);
  return Math.max(0, weeksPassed + 1);
}