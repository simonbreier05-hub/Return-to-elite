import {
  buildArrivalsPdf as arrivals, buildDeparturesPdf as departures, buildForecastPdf as forecast, buildTracesPdf as traces,
} from "@/lib/import/sample/build";
import type { SampleGuest, Scenario } from "@/lib/import/sample/scenario";
import {
  ARRIVALS_PAGE1_ROOMS, DEPARTURE_GROUPS, DEPARTURES_FROM, DEPARTURES_TO, FORECAST_DAYS, FORECAST_HISTORY_DAYS, FORECAST_INVENTORY,
  FORECAST_PRINT_DATE, FORECAST_START, GUESTS, LIST_DAY, REPORT_DATE, REPORT_TIME,
} from "./scenario";
import { TRACES_SAMPLE } from "./tracesSample";

/** Festes Test-Szenario (Opera-Demo-Hotel 05-16-18, Hotel-de-Rome-Forecast 22/09/26) — Wrapper um die Builder in src/lib/import/sample. */
export const DEMO: Scenario = {
  reportDate: REPORT_DATE, reportTime: REPORT_TIME, listDay: LIST_DAY,
  arrivals: GUESTS as SampleGuest[], arrivalsPage1Count: ARRIVALS_PAGE1_ROOMS.length,
  departureGroups: DEPARTURE_GROUPS.map((g) => ({ date: g.date, guests: g.rooms.map((r) => GUESTS.find((x) => x.room === r)! as SampleGuest) })),
  depFrom: DEPARTURES_FROM, depTo: DEPARTURES_TO,
  forecast: { printDate: FORECAST_PRINT_DATE, startIso: FORECAST_START, days: FORECAST_DAYS, historyDays: FORECAST_HISTORY_DAYS,
    inventory: FORECAST_INVENTORY, fromLabel: "15/09/26", toLabel: "14/10/26" },
  traces: TRACES_SAMPLE.map(({ expect: _e, ...t }) => (void _e, t)),
};

export const buildArrivalsPdf = (o: { onlyFirstPage?: boolean; guests?: SampleGuest[]; pageRooms?: string[]; listDay?: string; reportDate?: string } = {}) =>
  arrivals(DEMO, { onlyFirstPage: o.onlyFirstPage, arrivals: o.guests, page1Count: o.pageRooms?.length, listDay: o.listDay, reportDate: o.reportDate });
export const buildDeparturesPdf = (o: { to?: string; breakTotals?: boolean; reportDate?: string } = {}) => departures(DEMO, o);
export const buildForecastPdf = (o: { wrongOccAt?: number; dmyAmbiguousNoWeekday?: boolean } = {}) => forecast(DEMO, o);
export const buildTracesPdf = () => traces(DEMO);
