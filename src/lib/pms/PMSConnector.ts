/**
 * PMS integration boundary.
 *
 * The app talks ONLY to this interface. Today it is backed by
 * MockPMSConnector (local no-op with logging); in production it will be
 * OHIPConnector (Oracle Hospitality Integration Platform → OPERA Cloud).
 *
 * Contract:
 *  - onReservationEvent / onCheckout are INBOUND: the PMS notifies us.
 *  - pushRoomStatus is OUTBOUND — and by business rule, ONLY the INSPECTED
 *    status is ever pushed back to the PMS as "clean/sellable". The status
 *    API route enforces this; connectors may additionally guard it.
 */

export interface ReservationEvent {
  type: "NEW" | "UPDATE" | "CANCEL" | "CHECK_IN";
  roomNumber: string;
  guestName: string;
  eta?: string; // ISO timestamp
  vip?: boolean;
}

export interface CheckoutEvent {
  roomNumber: string;
  checkedOutAt: string; // ISO timestamp
  sameDayArrival?: boolean;
}

export interface PMSConnector {
  /** Inbound: reservation created/updated/cancelled/checked-in in the PMS. */
  onReservationEvent(handler: (event: ReservationEvent) => Promise<void>): void;

  /** Inbound: guest checked out — room becomes DIRTY, may need same-day turn. */
  onCheckout(handler: (event: CheckoutEvent) => Promise<void>): void;

  /**
   * Outbound: push a housekeeping status to the PMS.
   * Business rule: callers only invoke this with "INSPECTED".
   */
  pushRoomStatus(roomNumber: string, status: "INSPECTED"): Promise<void>;
}
