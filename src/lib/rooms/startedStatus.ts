/** Begonnene oder fertige Zimmer: beim Wechsel der Kraft bleibt der Fortschritt erhalten, vorher wird nachgefragt. Client-sicher. */
export const isStartedStatus = (status: string) => status === "IN_PROGRESS" || status === "CLEAN" || status === "INSPECTED";
