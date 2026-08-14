import type { CheckoutEvent, PMSConnector, ReservationEvent } from "./PMSConnector";

/**
 * OHIPConnector — documented stub for Oracle Hospitality Integration Platform
 * (OPERA Cloud). NOT wired up in the prototype; MockPMSConnector is used.
 *
 * Production wiring plan:
 *
 * INBOUND — OHIP Streaming API (business events over websocket/GraphQL
 * subscription, or the older async webhook delivery):
 *   - Subscribe to business events for the hotelId:
 *       RESERVATION (NEW/UPDATE/CANCEL), CHECK_IN, CHECK_OUT
 *   - Each event maps to onReservationEvent()/onCheckout() handlers, which
 *     the app uses to (a) reset rooms to DIRTY on checkout, (b) create/update
 *     Arrival rows (ETA, VIP), (c) flag same-day turns for the priority engine.
 *   - Endpoint shape: wss://<region>.hospitality-api.oraclecloud.com/... with
 *     OAuth2 client-credentials token from the OHIP gateway.
 *
 * OUTBOUND — OHIP Property/Housekeeping API:
 *   - PUT /hsk/v1/hotels/{hotelId}/rooms/{roomNumber}/housekeeping
 *     (or POST roomStatus update, per current OHIP spec) setting
 *     roomStatus=CLEAN + housekeepingRoomStatus=INSPECTED so OPERA marks the
 *     room sellable.
 *   - BUSINESS RULE: only INSPECTED is ever pushed. CLEAN-but-not-inspected
 *     rooms must NOT become sellable in OPERA.
 *
 * Config needed: OHIP_GATEWAY_URL, OHIP_CLIENT_ID, OHIP_CLIENT_SECRET,
 * OHIP_APP_KEY, HOTEL_ID.
 */
export class OHIPConnector implements PMSConnector {
  onReservationEvent(_handler: (event: ReservationEvent) => Promise<void>): void {
    // TODO: open OHIP Streaming API subscription and forward RESERVATION /
    // CHECK_IN business events into _handler.
    throw new Error("OHIPConnector is a stub — use MockPMSConnector in the prototype.");
  }

  onCheckout(_handler: (event: CheckoutEvent) => Promise<void>): void {
    // TODO: forward CHECK_OUT business events from the OHIP stream.
    throw new Error("OHIPConnector is a stub — use MockPMSConnector in the prototype.");
  }

  async pushRoomStatus(_roomNumber: string, _status: "INSPECTED"): Promise<void> {
    // TODO: OAuth2 token via OHIP gateway, then call the Housekeeping API to
    // set the room INSPECTED/sellable in OPERA Cloud.
    throw new Error("OHIPConnector is a stub — use MockPMSConnector in the prototype.");
  }
}
