import { audit } from "../audit";
import type { CheckoutEvent, PMSConnector, ReservationEvent } from "./PMSConnector";

/**
 * Local mock of the PMS. Records outbound pushes to the audit log so the
 * "only INSPECTED reaches the PMS" rule is visible and testable in the
 * prototype. Inbound handlers are registered but only fired by the demo
 * simulator (nothing external drives them yet).
 */
export class MockPMSConnector implements PMSConnector {
  private reservationHandlers: ((e: ReservationEvent) => Promise<void>)[] = [];
  private checkoutHandlers: ((e: CheckoutEvent) => Promise<void>)[] = [];

  onReservationEvent(handler: (event: ReservationEvent) => Promise<void>): void {
    this.reservationHandlers.push(handler);
  }

  onCheckout(handler: (event: CheckoutEvent) => Promise<void>): void {
    this.checkoutHandlers.push(handler);
  }

  async pushRoomStatus(roomNumber: string, status: "INSPECTED"): Promise<void> {
    // Defense in depth: the API route already restricts pushes to INSPECTED.
    if (status !== "INSPECTED") {
      throw new Error("PMS push rejected: only INSPECTED may be pushed to the PMS.");
    }
    console.log(`[MockPMS] → OPERA: room ${roomNumber} = CLEAN/INSPECTED (sellable)`);
    await audit({ action: "PMS_PUSH", meta: { roomNumber, status, connector: "mock" } });
  }

  /** Test/demo helpers to simulate inbound PMS traffic. */
  async simulateReservationEvent(event: ReservationEvent): Promise<void> {
    for (const h of this.reservationHandlers) await h(event);
  }

  async simulateCheckout(event: CheckoutEvent): Promise<void> {
    for (const h of this.checkoutHandlers) await h(event);
  }
}

/** Process-wide singleton used by the API routes. */
const g = globalThis as unknown as { __pms?: MockPMSConnector };
export const pms: MockPMSConnector = g.__pms ?? (g.__pms = new MockPMSConnector());
