#!/usr/bin/env python3
"""Tiny CLI so a playtesting agent can play one seat without hand-writing HTTP.

Env: SIM_API (default http://127.0.0.1:8020), SIM_GAME (game id), SIM_POWER (e.g. FRANCE).
Commands:
  create NAME POWER            host a private game (prints game id); passcode is always 'sim'
  join                         claim SIM_POWER in SIM_GAME
  state                        compact view of the board, your units/options, your orders
  orders "A PAR - BUR" "F BRE H" ...   submit your whole order set atomically (see syntax below)
  finalize                     lock your orders in
  unfinalize
  press-read [AFTER_SEQ]
  press-send "text" [--to POWER,POWER] [--anon]     (no --to = public)
  history [INDEX]              list resolved turns, or show one with every power's orders
  raw METHOD PATH [JSON]       escape hatch, e.g. raw GET /api/admin/status
Order syntax: "A PAR H" | "A PAR - BUR" | "A GAS - SPA/SC"(fleet coast) | "A BEL - LON VIA" (convoy)
  "A PAR S A MAR - BUR" | "A PAR S A MAR" (support hold) | "F NTH C A LON - BEL"
  retreats: "A LON R WAL" or "A LON D" | winter: "BUILD A VIE", "BUILD F STP/SC", "WAIVE", "DISBAND A BUD"
"""
import base64, json, os, re, sys, urllib.error, urllib.request

API = os.environ.get("SIM_API", "http://127.0.0.1:8020")
GAME = os.environ.get("SIM_GAME", "proto_1901")
POWER = os.environ.get("SIM_POWER", "")


def token(power):
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    return f"{b({'alg': 'none', 'typ': 'JWT'})}.{b({'sub': 'sim_' + power.lower(), 'email': power.lower() + '@sim.test'})}."


def call(method, path, body=None, power=None):
    sep = "&" if "?" in path else "?"
    req = urllib.request.Request(
        f"{API}{path}{sep}game_id={GAME}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token(power or POWER or 'gm')}"},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or "null")
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} {method} {path}: {e.read().decode()[:600]}")
        sys.exit(1)


def parse(s, units, orders, power):
    t = s.strip().upper().replace("–", "-")
    # In a retreat phase the dislodged unit and the new occupier share a province: the caller's own unit wins.
    by_prov = {u["province"]: u for u in sorted(units, key=lambda u: u["power"] == power)}
    if t == "WAIVE":
        slot = next((o for o in orders.values() if o["power"] == power and o["order_type"] in ("WAIVE", "BUILD")), None)
        return None if slot is None else {**slot, "order_type": "WAIVE", "is_explicit": True}
    m = re.match(r"^BUILD ([AF]) ([A-Z]{3})(?:/([A-Z]{2}))?$", t)
    if m:
        taken = {o.get("origin") for o in orders.values() if o["order_type"] == "BUILD" and o["power"] == power}
        # Build slots have one id per home centre (BUILD_FRANCE_BRE); match it first so two builds never share a slot.
        slot = next((o for o in orders.values() if o["power"] == power and o["unit_id"] == f"BUILD_{power}_{m[2]}"), None) or next(
            (o for o in orders.values() if o["power"] == power and o["order_type"] in ("WAIVE", "BUILD") and (o["origin"] == m[2] or o["order_type"] == "WAIVE" and m[2] not in taken)),
            None,
        )
        if slot is None:
            sys.exit(f"no build slot for {m[2]}; slots: {[o['unit_id'] for o in orders.values() if o['power']==power and o['order_type'] in ('WAIVE','BUILD')]}")
        return {**slot, "order_type": "BUILD", "unit_type": m[1], "origin": m[2], "origin_coast": m[3], "target": None, "is_explicit": True}
    m = re.match(r"^([AF]) ([A-Z]{3})(?:/([A-Z]{2}))? (H|D|-|R|S|C)(?:\s+(.*))?$", t)
    if not m:
        sys.exit(f"cannot parse order: {s}")
    kind, prov, _c, verb, rest = m.groups(); rest = rest or ""
    u = by_prov.get(prov)
    if not u or u["power"] != power:
        sys.exit(f"you have no unit in {prov}: {s}")
    o = {"unit_id": u["id"], "power": power, "unit_type": u["unit_type"], "origin": prov, "origin_coast": u.get("coast"),
         "order_type": "HOLD", "target": None, "target_coast": None, "aux_unit_origin": None, "via_convoy": False, "is_explicit": True}
    if verb == "H":
        pass
    elif verb == "D":
        o["order_type"] = "DISBAND"
    elif verb in ("-", "R"):
        via = rest.endswith(" VIA")
        dest, _, coast = rest.replace(" VIA", "").strip().partition("/")
        o.update(order_type="MOVE" if verb == "-" else "RETREAT", target=dest, target_coast=coast or None, via_convoy=via)
    else:  # S or C: "A MAR - BUR" or "A MAR"
        mm = re.match(r"^[AF] ([A-Z]{3})(?:/[A-Z]{2})?(?: - ([A-Z]{3}))?", rest)
        if not mm:
            sys.exit(f"cannot parse supported/convoyed unit: {s}")
        o.update(order_type="SUPPORT" if verb == "S" else "CONVOY", aux_unit_origin=mm[1], target=mm[2] or mm[1])
    return o


def show_state():
    g = call("GET", "/api/game")["state"]
    me = POWER
    sc = {}
    for p, pw in g["ownership"].items():
        sc[pw] = sc.get(pw, 0) + 1  # includes non-SC ownership; fine for a rough count
    print(f"{g['season']} {g['year']} {g['phase']} | winner={g['winner']} | finalized={g['finalized_powers']} | surrendered={g['surrendered_powers']}")
    by = {}
    for u in g["units"]:
        by.setdefault(u["power"], []).append(f"{u['unit_type'][0]} {u['province']}{'/' + u['coast'] if u.get('coast') else ''}{'(DISLODGED)' if u['is_dislodged'] else ''}")
    for p, us in by.items():
        print(f"  {p}: {', '.join(us)}")
    print("  owned provinces:", {p: ", ".join(sorted(k for k, v in g['ownership'].items() if v == p)) for p in by})
    if g.get("builds") and me in g["builds"]:
        print("  YOUR BUILDS:", g["builds"][me])
    print(f"--- YOUR ({me}) units, options, current orders ---")
    for u in g["units"]:
        if u["power"] != me:
            continue
        opt = g["unit_options"].get(u["id"], {})
        o = g["orders"].get(u["id"], {})
        print(f"  {u['unit_type'][0]} {u['province']}: order={o.get('order_type')} {o.get('target') or ''}{' sup/conv ' + o['aux_unit_origin'] if o.get('aux_unit_origin') else ''}"
              f" | moves={opt.get('direct_moves')} convoy={opt.get('active_convoys')} supports={[(s['province'], s['moves']) for s in opt.get('valid_supports', [])]}")
    for o in g["orders"].values():
        if o["power"] == me and o["order_type"] in ("BUILD", "WAIVE"):
            print(f"  build slot {o['unit_id']}: {o['order_type']} {o['origin']}")
    if g["issues"]:
        print("  issues:", [i.get("message", i) for i in g["issues"]][:8])
    return g


def main():
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    cmd = a[0]
    ident = {"user_id": "sim_" + POWER.lower(), "email": POWER.lower() + "@sim.test", "display_name": POWER.title()}
    if cmd == "create":
        r = call("POST", "/api/games", {"name": a[1], "creator_power": a[2].upper(), **ident, "user_id": "sim_" + a[2].lower(), "email": a[2].lower() + "@sim.test",
                                        "display_name": a[2].title(), "is_private": True, "passcode": "sim"}, power=a[2].upper())
        print(r["game_id"])
    elif cmd == "join":
        call("POST", f"/api/games/{GAME}/join", {"power": POWER, "passcode": "sim", **ident})
        print("joined", POWER)
    elif cmd == "state":
        show_state()
    elif cmd == "orders":
        g = call("GET", "/api/game")["state"]
        parsed = [parse(s, g["units"], g["orders"], POWER) for s in a[1:]]
        orders = [o for o in parsed if o]
        r = call("POST", "/api/orders/batch", {"power": POWER, "orders": orders})
        print("accepted", len(orders), "orders; issues:", [i.get("message", i) for i in r.get("issues", []) if i.get("power", POWER) == POWER][:8])
    elif cmd in ("finalize", "unfinalize"):
        g = call("GET", "/api/game")["state"]
        r = call("POST", f"/api/{cmd}", {"power": POWER, "force": True, "turn": f"{g['season']} {g['year']} {g['phase']}"} if cmd == "finalize" else {"power": POWER})
        print(r if cmd == "finalize" else "unfinalized")
    elif cmd == "press-read":
        q = f"?after={a[1]}" if len(a) > 1 else ""
        f = call("GET", "/api/press" + q)
        for m in f["messages"]:
            to = ",".join(m.get("recipients") or []) or "PUBLIC"
            print(f"#{m.get('seq')} [{m.get('sender') or 'anon'} -> {to}] {m['body']}")
    elif cmd == "press-send":
        to = a[a.index("--to") + 1].upper().split(",") if "--to" in a else []
        call("POST", "/api/press", {"power": POWER, "recipients": to, "anonymous": "--anon" in a, "body": a[1]})
        print("sent")
    elif cmd == "history":
        print(json.dumps(call("GET", "/api/history" + (f"/{a[1]}" if len(a) > 1 else "")), indent=1)[:6000])
    elif cmd == "raw":
        print(json.dumps(call(a[1], a[2], json.loads(a[3]) if len(a) > 3 else None), indent=1)[:8000])
    else:
        sys.exit(__doc__)


main()
