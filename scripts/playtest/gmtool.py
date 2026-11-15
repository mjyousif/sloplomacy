#!/usr/bin/env python3
"""Game Master helper for a playtest: compact views the player CLI does not give.

Env: SIM_API (default http://127.0.0.1:8020), SIM_GAME (game id).
Commands:
  hist N         one resolved turn: every power's orders with results, centre counts, builds, retreats
  sc             current phase, who has finalized, centre counts, builds and retreats owed
  probe POWER    fog-of-war check: what POWER can see of other powers' live orders and issues
  units          every unit on the board
"""
import os, sys
from pathlib import Path

# Reuse the player CLI's token and HTTP helpers (everything above its show_state).
ns = {}
exec((Path(__file__).parent / "sim_client.py").read_text().split("\ndef show_state")[0], ns)
call = ns["call"]
SCS = "EDI LVP LON BRE PAR MAR KIE MUN BER VEN ROM NAP VIE BUD TRI STP MOS WAR SEV CON ANK SMY NWY SWE DEN HOL BEL SPA POR TUN SER RUM BUL GRE".split()


def ostr(o):
    t = o["order_type"]; u = f"{o['unit_type'][0]} {o['origin']}" + (f"/{o['origin_coast']}" if o.get("origin_coast") else "")
    tgt = (o.get("target") or "") + (f"/{o['target_coast']}" if o.get("target_coast") else "")
    if t == "MOVE": s = f"{u}-{tgt}" + (" VIA" if o.get("via_convoy") else "")
    elif t == "SUPPORT": s = f"{u} S {o.get('aux_unit_origin')}" + (f"-{tgt}" if tgt and tgt != o.get("aux_unit_origin") else "")
    elif t == "CONVOY": s = f"{u} C {o.get('aux_unit_origin')}-{tgt}"
    elif t == "HOLD": s = f"{u} H"
    else: s = f"{u} {t} {tgt}"
    return s + ("" if o.get("is_explicit") else "*")


def sc(own):
    c = {}
    for p, w in own.items():
        if p in SCS: c[w] = c.get(w, 0) + 1
    return " ".join(f"{k[:3]}={v}" for k, v in sorted(c.items()))


if len(sys.argv) < 2:
    sys.exit(__doc__)
cmd = sys.argv[1]
if cmd == "hist":
    h = call("GET", f"/api/history/{sys.argv[2]}", power="FRANCE")
    r = h["resolution"]; res = r["resolutions"]
    print(h["season"], h["year"], h["phase"], "->", r["next_season"], r["next_year"], r["next_phase"], "winner", r["winner"])
    by = {}
    for o in h["orders"].values():
        x = res.get(o["unit_id"], {})
        flag = "" if x.get("succeeded") else " FAIL"
        flag += " bounced" if x.get("bounced") else ""; flag += " CUT" if x.get("cut") else ""
        flag += f" DISLODGED by {x.get('dislodged_by')}" if x.get("dislodged") else ""
        by.setdefault(o["power"], []).append(ostr(o) + flag)
    for p, l in by.items(): print(f"  {p[:3]}: " + "; ".join(l))
    missing = set(res) - set(h["orders"])
    if missing: print("  resolutions w/o order:", missing)
    print("  SC before:", sc(h["ownership"]), "| after:", sc(r["new_ownership"]))
    print("  builds:", {k: v for k, v in r["builds"].items() if v}, "retreats:", {k: v for k, v in r["retreats"].items() if v})
    print("  after units:", "; ".join(f"{u['power'][:3]} {u['unit_type'][0]} {u['province']}{'/'+u['coast'] if u.get('coast') else ''}{' DISL' if u['is_dislodged'] else ''}" for u in r["new_units"]))
elif cmd == "sc":
    g = call("GET", "/api/game", power="FRANCE")["state"]
    print(g["season"], g["year"], g["phase"], "fin", g["finalized_powers"], "winner", g["winner"], "| SC:", sc(g["ownership"]), "| builds", {k: v for k, v in (g["builds"] or {}).items() if v}, "retreats", {k: v for k, v in (g["retreats"] or {}).items() if v})
elif cmd == "probe":
    v = sys.argv[2]
    g = call("GET", "/api/game", power=v)["state"]
    leaks = [ostr(o) for o in g["orders"].values() if o["power"] != v and (o.get("is_explicit") or o["order_type"] not in ("HOLD", "WAIVE", "DISBAND"))]
    lr = g.get("preview") or {}
    lrleak = [f"{k}:{x['order_type']}>{x.get('target')}" for k, x in (lr.get("resolutions") or {}).items() if not k.startswith(v[:3]) and x["order_type"] != "HOLD"]
    iss = [i for i in g["issues"] if i.get("power") not in (None, v)]
    print(f"probe as {v} in {g['season']} {g['year']} {g['phase']}: fin={g['finalized_powers']} foreign orders visible={leaks} preview foreign non-hold={lrleak} foreign issues={len(iss)}")
    mine = {k: (x["succeeded"], x["bounced"], x.get("reason", "")[:60]) for k, x in (lr.get("resolutions") or {}).items() if k.startswith(v[:3])}
    print("  own preview:", mine)
elif cmd == "units":
    g = call("GET", "/api/game", power="FRANCE")["state"]
    print("; ".join(f"{u['power'][:3]} {u['unit_type'][0]} {u['province']}{'/'+u['coast'] if u.get('coast') else ''}{' DISL' if u['is_dislodged'] else ''}" for u in g["units"]))
else:
    sys.exit(__doc__)
