/**
 * Short, radio-friendly numbers for today's active housekeepers — "3" is
 * faster to shout across a floor (or say over the radio) than a full name.
 * Assigned fresh whenever a morning plan is applied (see POST
 * /api/assignments/apply): alphabetical by name, 1-based, ephemeral —
 * nothing here persists a number to a specific person across days.
 */
export function assignDailyNumbers<T extends { id: string; name: string }>(
  attendants: T[]
): { id: string; dailyNumber: number }[] {
  return [...attendants]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a, index) => ({ id: a.id, dailyNumber: index + 1 }));
}
