"""
Nachbau der fünf Opera-Listen für den 28.10.2026 (reportlab) — ERFUNDENE Namen.
Soll-Zahlen (wie vom Nutzer beschrieben): In-House 113 = 38 RESV + 75 CKIN, Abreisen 26/24/21
(12 Same-Day-Turns), 155 Personen, 3 Zimmer außer Betrieb (112, 222, 430), Auslastung 79,58 %,
Traces 44 (30 offen). Mehrseitig, jede Seite mit Kopfzeile; In-House mit Etagenüberschriften,
optionaler Firma, VIP V1/V2, Trace-Markierung „T" am Zeilenende, Typen XAS/XDL, Kinder > 0.

Hinweis: Das ist NICHT die Datei des Nutzers, sondern eine Rekonstruktion nach seiner Beschreibung.
Aufruf:  python3 -I tests/fixtures/opera/2026-10-28/make_fixtures.py   (schreibt die PDFs daneben)
"""
import json, os, random
from datetime import date, timedelta
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

OUT = os.path.dirname(os.path.abspath(__file__))
TODAY = date(2026, 10, 28)
W, H = landscape(A4)
d = lambda x: x.strftime("%d/%m/%y")
rnd = random.Random(20261028)

ROOMS = ("101 102 104 105 109 110 111 112 114 115 116 117 118 119 120 121 122 123 124 125 126 127 128 129 130 131 132 133 134 135 136 137 "
  "201 202 203 204 205 206 207 208 209 210 211 212 214 215 216 217 218 219 220 221 222 223 224 225 226 227 228 229 230 231 232 233 234 235 236 237 "
  "301 304 307 308 309 310 311 312 314 315 316 317 318 319 320 321 322 323 324 325 326 327 328 329 330 331 332 333 334 335 336 337 338 "
  "401 402 412 414 415 416 417 418 419 420 421 422 423 424 425 428 431 432 433 434 435 436 437 "
  "514 515 517 518 519 521 522 523 524 526 529 530 533 534 535").split()
OOO = ["112", "222", "430"]  # 430 ist nicht im digitalisierten Zimmerstamm
free = [r for r in ROOMS if r not in OOO]
rnd.shuffle(free)
dep_today, stay_rooms, arr_vacant = free[:26], free[26:101], free[101:127]
turns = dep_today[:12]
arr_rooms = turns + arr_vacant  # 38

LAST = ["Testfrau", "Demo", "Beispiel", "Probe", "Muster", "Fiktiv", "Erfunden", "Mustermann", "Testmann", "Probst", "Demofrau", "Fiktivo", "Beispielmann", "Probemann", "Testerin"]
FIRST = ["Anna", "Jonas", "Bernd", "Gerda", "Eva", "Dieter", "Ida", "Karin", "Carla", "Franz", "Max", "Leo", "Lena", "Paul", "Nora"]
SAL = ["Mr.", "Mrs.", "Ms.", "Dr. Mr.", "Herr", "Frau"]
TYPES = ["STDK", "DLXK", "XAS", "XDL", "JSK"]
COMPANIES = ["", "", "", "ACME GmbH", "Beispiel AG", "Muster KG"]

def guest(room, arr, dep, status):
    n = len(gs)
    return dict(room=room, name=f"{LAST[n % 15]}, {FIRST[(n * 7) % 15]} {SAL[n % 6]}", arr=arr, dep=dep, nts=(dep - arr).days,
                status=status, type=TYPES[n % 5], company=COMPANIES[n % 6], vip=("V1" if n % 9 == 0 else "V2" if n % 13 == 0 else ""),
                adl=1, chl=0, trace=False, time=f"{14 + n % 8:02d}:{(n * 5) % 60:02d}")

gs = []
# Abreisen heute (26)
for i, r in enumerate(dep_today):
    gs.append(guest(r, TODAY - timedelta(days=1 + i % 6), TODAY, "CKIN"))
# Bleiber (75): 16 reisen morgen ab, 14 übermorgen, 45 später
for i, r in enumerate(stay_rooms):
    dep = TODAY + timedelta(days=1 if i < 16 else 2 if i < 30 else 3 + i % 6)
    gs.append(guest(r, TODAY - timedelta(days=1 + i % 9), dep, "CKIN"))
# Anreisen heute (38): 8 reisen morgen ab, 7 übermorgen
for i, r in enumerate(arr_rooms):
    dep = TODAY + timedelta(days=1 if i < 8 else 2 if i < 15 else 3 + i % 5)
    gs.append(guest(r, TODAY, dep, "RESV"))
dep_g = gs[:26]; stay_g = gs[26:101]; arr_g = gs[101:]
inhouse = stay_g + arr_g  # 113
# Personen heute Nacht = 155: 36 Zimmer mit 2 Erwachsenen, 6 mit einem Kind
for g in inhouse[:36]: g["adl"] = 2
for g in inhouse[40:46]: g["chl"] = 1
assert sum(g["adl"] + g["chl"] for g in inhouse) == 155

# Traces: 44, 30 offen — Hausmann 19/13, Housekeeping 15/10, Front Office 6/6, Technik 4/1
TR = [("HM", "TWIN", "Twin beds please", 19, 13), ("HK", "HK", "Extra towels and pillows", 15, 10),
      ("FO", "LCO", "Late check-out requested", 6, 6), ("ENG", "ENG", "TV remote not working", 4, 1)]
trace_rows = []
pool = inhouse + dep_g
k = 0
for dept, code, text, total, open_ in TR:
    for j in range(total):
        g = pool[(k * 5) % len(pool)]; k += 1
        g["trace"] = True
        trace_rows.append(dict(room=g["room"], name=g["name"].rsplit(" ", 1)[0], arr=g["arr"], dep=g["dep"], dept=dept, code=code,
                               tdate=TODAY - timedelta(days=j % 2), text=f"{text} #{j + 1}", resolved=j >= open_))
assert len(trace_rows) == 44 and sum(not t["resolved"] for t in trace_rows) == 30

def page_head(c, title, page, total, time="05:12"):
    c.setFont("Helvetica-Oblique", 10); c.drawString(370, H - 25, "HOTEL DE ROME BERLIN")
    c.setFont("Helvetica", 7.5); c.drawString(780, H - 25, d(TODAY)); c.drawString(780, H - 40, time)
    c.setFont("Helvetica-BoldOblique", 10); c.drawString(380, H - 55, title)
    c.setFont("Helvetica-Oblique", 7.5); c.drawString(400, 40, f"Page {page} of {total}")

def cols(c, y, spec, size=7.5):
    c.setFont("Helvetica", size)
    for t, x in spec: c.drawString(x, y, t)

# ───────── In House (Tagesbelegung) ─────────
IH_COLS = [("Room No.", 20), ("Name", 60), ("Company", 160), ("VIP", 240), ("Arr. Date", 270), ("Dep. Date", 320), ("Adl.", 370), ("Chl.", 395),
           ("Rms", 420), ("Nts", 445), ("Room Type", 470), ("Rate Code", 530), ("Res. Status", 590), ("Balance", 660), ("Trc", 730)]
def inhouse_pdf(path):
    rows = sorted(inhouse, key=lambda g: g["room"])
    per = 25
    chunks = [rows[i:i + per] for i in range(0, len(rows), per)]
    c = canvas.Canvas(path, pagesize=(W, H))
    for pi, chunk in enumerate(chunks):
        page_head(c, "In House Guests", pi + 1, len(chunks))
        y = H - 85; cols(c, y, IH_COLS); c.line(20, y - 6, 822, y - 6); y -= 22
        floor = None
        for g in chunk:
            f = g["room"][0]
            if f != floor:
                c.setFont("Helvetica-Bold", 8); c.drawString(20, y, f"Etage {f}" + (" (Fortsetzung)" if floor is None and pi > 0 and chunks[pi - 1][-1]["room"][0] == f else "")); y -= 13; floor = f
            c.setFont("Helvetica", 7.5)
            vals = [g["room"], g["name"], g["company"], g["vip"], d(g["arr"]), d(g["dep"]), str(g["adl"]), str(g["chl"]), "1", str(g["nts"]),
                    g["type"], "RACK", g["status"], "598.00", "T" if g["trace"] else ""]
            for (_, x), v in zip(IH_COLS, vals):
                if v: c.drawString(x, y, v)
            y -= 13
        if pi == len(chunks) - 1:
            c.setFont("Helvetica-Bold", 7.5); c.drawString(250, y - 4, "Total"); c.setFont("Helvetica", 7.5)
            c.drawString(370, y - 4, str(sum(g["adl"] for g in rows))); c.drawString(395, y - 4, str(sum(g["chl"] for g in rows))); c.drawString(420, y - 4, str(len(rows)))
        c.setFont("Helvetica", 6.5); c.drawString(20, 60, f"Filter: In House on {d(TODAY)}")
        c.showPage()
    c.save()

# ───────── Departures (3 Tage) ─────────
DEP_COLS = [("Room No.", 20), ("Name", 60), ("Company", 160), ("VIP Code", 240), ("Arr. Date", 290), ("Dep. Date", 340), ("Adl.", 385), ("Chl.", 405), ("Rms", 425),
            ("Nts", 445), ("Room Type", 470), ("Rate Code", 560), ("Res. Status", 605), ("Pay Mth", 705), ("Balance", 770)]
def departures_pdf(path):
    groups = [(TODAY + timedelta(days=k), sorted([g for g in gs if g["dep"] == TODAY + timedelta(days=k)], key=lambda g: g["room"])) for k in range(3)]
    assert [len(x[1]) for x in groups] == [26, 24, 21]
    lines = []
    for day, glist in groups:
        lines.append(("group", day))
        lines += [("row", g) for g in glist]
        lines.append(("total", glist))
    per = 20
    chunks = [lines[i:i + per] for i in range(0, len(lines), per)]
    c = canvas.Canvas(path, pagesize=(W, H))
    for pi, chunk in enumerate(chunks):
        page_head(c, "Departures", pi + 1, len(chunks), "04:33")
        y = H - 85; cols(c, y, DEP_COLS); y -= 11; cols(c, y, [("Travel Agent", 160)]); y -= 11; cols(c, y, [("Group", 160)]); c.line(20, y - 6, 822, y - 6); y -= 22
        for kind, v in chunk:
            if kind == "group":
                c.setFont("Helvetica-Bold", 7.5); c.drawString(20, y, "Departure"); c.drawString(70, y, d(v)); y -= 13
            elif kind == "row":
                g = v; c.setFont("Helvetica", 7.5)
                vals = [g["room"], g["name"], g["company"], g["vip"], d(g["arr"]), d(g["dep"]), str(g["adl"]), str(g["chl"]), "1", str(g["nts"]), g["type"], "RACK",
                        "DUOT" if g["dep"] == TODAY else g["status"], "CA", "598.00"]
                for (_, x), s in zip(DEP_COLS, vals):
                    if s: c.drawString(x, y, s)
                y -= 13
            else:
                c.setFont("Helvetica-Bold", 7.5); c.drawString(250, y - 2, "Total"); c.setFont("Helvetica", 7.5)
                c.drawString(385, y - 2, str(sum(g["adl"] for g in v))); c.drawString(405, y - 2, str(sum(g["chl"] for g in v)))
                c.drawString(425, y - 2, str(len(v))); c.drawString(445, y - 2, str(sum(g["nts"] for g in v))); y -= 22
        c.setFont("Helvetica", 6.5); c.drawString(20, 60, f"Filter: From Departure Date {d(TODAY)}"); c.drawString(20, 52, f"To Departure Date {d(TODAY + timedelta(days=2))}")
        c.showPage()
    c.save()

# ───────── Arrivals: Detailed ─────────
ARR_COLS = [("Room No.", 20), ("Name", 55), ("Company", 160), ("Arr. Date", 255), ("Dep.Date", 305), ("Room Type", 350), ("Adl.", 395), ("Chl.", 415),
            ("Rms.", 435), ("Mkt. Code", 455), ("Src. Code", 495), ("Res. Status", 535), ("Rate Code", 580), ("Currency", 625), ("Rate Amount", 665)]
def arrivals_pdf(path):
    rows = sorted(arr_g, key=lambda g: g["room"])
    per = 9
    chunks = [rows[i:i + per] for i in range(0, len(rows), per)]
    c = canvas.Canvas(path, pagesize=(W, H))
    for pi, chunk in enumerate(chunks):
        page_head(c, "Arrivals: Detailed", pi + 1, len(chunks), "05:01")
        y = H - 85; cols(c, y, ARR_COLS); y -= 12
        cols(c, y, [("Conf No.", 55), ("VIP", 175), ("Arr. Time", 255)]); c.line(20, y - 6, 822, y - 6); y -= 24
        for g in chunk:
            c.setFont("Helvetica", 7.5)
            vals = [g["room"], g["name"], g["company"], d(g["arr"]), d(g["dep"]), g["type"], str(g["adl"]), str(g["chl"]), "1", "CORP", "GSALE", g["status"], "RACK", "EUR", "299.00"]
            for (_, x), s in zip(ARR_COLS, vals):
                if s: c.drawString(x, y, s)
            y -= 11
            c.drawString(55, y, str(1920000 + gs.index(g)))
            if g["vip"]: c.drawString(175, y, g["vip"])
            c.drawString(255, y, g["time"])
            for t in [t for t in trace_rows if t["room"] == g["room"] and not t["resolved"]][:1]:
                y -= 11; c.drawString(105, y, f"Traces: {t['code']} {d(t['tdate'])} {t['text']}")
            y -= 20
        c.setFont("Helvetica", 6.5); c.drawString(20, 60, f"Filter: Stay From Date {d(TODAY)}"); c.drawString(20, 52, f"Stay To Date {d(TODAY)}")
        c.showPage()
    c.save()

# ───────── Traces ─────────
TR_COLS = [("Room No.", 30), ("Name", 80), ("Arr. Date", 200), ("Dep. Date", 255), ("Dept.", 310), ("Trace Code", 345), ("Trace Date", 405), ("Trace Text", 465), ("Resolved", 770)]
def traces_pdf(path):
    rows = sorted(trace_rows, key=lambda t: t["room"])
    per = 20
    chunks = [rows[i:i + per] for i in range(0, len(rows), per)]
    c = canvas.Canvas(path, pagesize=(W, H))
    for pi, chunk in enumerate(chunks):
        page_head(c, "Traces", pi + 1, len(chunks), "04:20")
        y = H - 85; cols(c, y, TR_COLS, 8); c.line(30, y - 6, 812, y - 6); y -= 22
        for t in chunk:
            vals = [t["room"], t["name"], d(t["arr"]), d(t["dep"]), t["dept"], t["code"], d(t["tdate"]), t["text"], "Y" if t["resolved"] else "N"]
            cols(c, y, [(v, x) for (_, x), v in zip(TR_COLS, vals)], 8); y -= 18
        c.setFont("Helvetica", 7); c.drawString(30, 55, "Filter: Departments All   Resolved All")
        c.showPage()
    c.save()

# ───────── History and Forecast ─────────
FC_HEADS = ["Total Occ.", "Arr.", "Comp.", "House", "Deduct", "Non-Ded.", "Deduct", "Non-Ded.", "Occ.%", "Room Revenue", "Average Rate", "Dep.", "Day Use", "No Show", "OOO", "Adlt. & Chl."]
FC_HEADS2 = ["Rooms", "Rooms", "Rooms", "Use", "Indiv.", "Indiv.", "Group", "Group", "", "", "", "Rooms", "Rooms", "Rooms", "Rooms", "Chl."]
WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
def forecast_pdf(path):
    c = canvas.Canvas(path, pagesize=(W, H))
    page_head(c, "History and Forecast", 1, 1, "07:06")
    xs = [80 + i * 47 for i in range(16)]
    y = H - 85; c.setFont("Helvetica", 6.5); c.drawString(20, y, "Date")
    for h, x in zip(FC_HEADS, xs): c.drawString(x, y, h)
    y -= 9; c.drawString(20, y, "Rooms")
    for h, x in zip(FC_HEADS2, xs):
        if h: c.drawString(x, y, h)
    c.line(20, y - 6, 822, y - 6); y -= 18
    def row(day, occ, arr, dep, ooo, persons):
        nonlocal y
        pct = round(occ / (145 - ooo) * 100, 2); rev = occ * 351.2
        vals = [str(occ), str(arr), "1", "0", str(round(occ * 0.8)), "0", str(occ - round(occ * 0.8) - 1), "0", f"{pct:.2f}%", f"{rev:,.2f}", f"{rev / occ:,.2f}", str(dep), "0", "0", str(ooo), str(persons)]
        c.setFont("Helvetica", 6.5); c.drawString(20, y, f"{d(day)} {WD[day.weekday()]}")
        for v, x in zip(vals, xs): c.drawString(x, y, v)
        y -= 11
    c.setFont("Helvetica-Bold", 6.5); c.drawString(20, y, "History"); y -= 11
    for k in (3, 2, 1): row(TODAY - timedelta(days=k), 100 + k, 30, 28, 3, 140 + k)
    c.setFont("Helvetica-Bold", 6.5); c.drawString(20, y, "Forecast"); y -= 11
    row(TODAY, 113, 38, 26, 3, 155)
    for k in range(1, 14): row(TODAY + timedelta(days=k), 90 + (k * 7) % 40, 20 + k, 24 if k == 1 else 21 if k == 2 else 18 + k % 9, 3, 130 + k)
    c.setFont("Helvetica", 6.5); c.drawString(20, 60, f"Filter: From Date {d(TODAY - timedelta(days=3))} To Date {d(TODAY + timedelta(days=13))}")
    c.showPage(); c.save()

inhouse_pdf(os.path.join(OUT, "inhouse_28-10-26.pdf"))
departures_pdf(os.path.join(OUT, "departures_28-10-26.pdf"))
arrivals_pdf(os.path.join(OUT, "arrivals_28-10-26.pdf"))
traces_pdf(os.path.join(OUT, "traces_28-10-26.pdf"))
forecast_pdf(os.path.join(OUT, "forecast_28-10-26.pdf"))
# Soll-Werte für die Tests (nur Zimmernummern und Zahlen, keine Namen)
json.dump({
    "date": TODAY.isoformat(), "inhouse": 113, "resv": 38, "ckin": 75, "departureRows": 71, "departuresToday": 26, "departuresTomorrow": 24,
    "departuresDayAfter": 21, "turns": 12, "arrivals": 38, "traces": 44, "tracesOpen": 30, "persons": 155, "outOfOrder": OOO, "occupancyPct": 79.58,
    "rooms": {"departuresToday": sorted(dep_today), "turns": sorted(turns), "stayovers": sorted(stay_rooms), "arrivalsVacant": sorted(arr_vacant)},
}, open(os.path.join(OUT, "expected.json"), "w"), indent=1)
print("ok")
