/**
 * Which of today's actionable rooms (the same set /api/assignments/plan
 * already computed — see PlanResponse.rooms) still have nobody assigned,
 * live on the board. Deliberately reuses that computation rather than
 * re-deriving "actionable today" from status/occupancy a second time — see
 * the grundriss planning panel, which is the one caller.
 */
export interface UnassignedActionableInput {
  /** Ids of every room the plan already treats as actionable today (PlanResponse.rooms' keys). */
  actionableRoomIds: string[];
  /** Ids set aside for capacity and intentionally not assigned today (PlanResponse.deferredRooms). */
  deferredRoomIds: string[];
  /** Live assignedToId per room id, as currently persisted on the board. */
  assignedToIdByRoomId: Record<string, string | null | undefined>;
}

export interface UnassignedActionableResult {
  /** Actionable rooms minus the ones deferred to tomorrow — today's real denominator. */
  totalActionable: number;
  /** Of those, the ones with nobody assigned yet. */
  unassignedRoomIds: string[];
}

export function unassignedActionableRooms(input: UnassignedActionableInput): UnassignedActionableResult {
  const deferred = new Set(input.deferredRoomIds);
  const todayActionable = input.actionableRoomIds.filter((id) => !deferred.has(id));
  const unassignedRoomIds = todayActionable.filter((id) => !input.assignedToIdByRoomId[id]);
  return { totalActionable: todayActionable.length, unassignedRoomIds };
}
