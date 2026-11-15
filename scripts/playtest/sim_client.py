#!/usr/bin/env python3
"""Tiny CLI so a playtesting agent can play one seat without hand-writing HTTP.

Env: SIM_API (default http://127.0.0.1:8020), SIM_GAME (game id), SIM_POWER (e.g. FRANCE).
Put the env inline on every command (`SIM_API=... SIM_GAME=... SIM_POWER=... python3 ...`): in zsh a
command kept in a variable is not split into words.
Commands:
  create NAME POWER            host a private game (prints game id); passcode is always 'sim'
  join                         claim SIM_POWER in SIM_GAME
  state                        compact view of the board, your units/options, your orders
  orders "A PAR - BUR" "F BRE H" ...   submit your whole order set atomically (see syntax below)
  finalize                     lock your orders in (prints one line)
  unfinalize
  press-read [AFTER_SEQ]
  press-send "text" [--to POWER,POWER] [--anon]     (no --to = public; --anon needs --to)
  history [INDEX]              list resolved turns, or one turn: every power's orders and results
  raw METHOD PATH [JSON]       escape hatch, e.g. raw GET /api/admin/status (prints all of it)
  --self-test                  play one scripted year on a fresh game and check every step
Order syntax: "A PAR H" | "A PAR - BUR" | "F GAS - SPA/SC"(fleet coast) | "A BEL - LON VIA" (convoy)
  "A PAR S A MAR - BUR" | "A PAR S A MAR" (support hold) | "F NTH C A LON - BEL"
  retreats: "A LON R WAL" or "A LON D" | winter: "BUILD A VIE", "BUILD F STP/SC", "WAIVE", "DISBAND A BUD"
"""
import base64, json, os, re, sys, urllib.error, urllib.request

API = os.environ.get("SIM_API", "http://127.0.0.1:8020")
GAME = os.environ.get("SIM_GAME", "proto_1901")
POWER = os.environ.get("SIM_POWER", "")
POWERS = "AUSTRIA ENGLAND FRANCE GERMANY ITALY RUSSIA TURKEY".split()
SCS = "EDI LVP LON BRE PAR MAR KIE MUN BER VEN ROM NAP VIE BUD TRI STP MOS WAR SEV CON ANK SMY NWY SWE DEN HOL BEL SPA POR TUN SER RUM BUL GRE".split()


def token(power):
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    return f"{b({'alg': 'none', 'typ': 'JWT'})}.{b({'sub': 'sim_' + power.lower(), 'email': power.lower() + '@sim.test'})}."


class ApiError(Exception):
    pass


def call(method, path, body=None, power=None, exit_on_error=True):
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
        msg = f"HTTP {e.code} {method} {path}: {e.read().decode()[:600]}"
        if not exit_on_error:
            raise ApiError(msg) from e
        print(msg)
        sys.exit(1)


def turn_of(g):
    return f"{g['season']} {g['year']} {g['phase']}"


def centres(ownership):
    """Supply centres per power. Ownership also holds plain land a power last stood on."""
    c = {}
    for p, w in ownership.items():
        if p in SCS:
            c[w] = c.get(w, 0) + 1
    return c


def ostr(o):
    t = o["order_type"]; u = f"{o['unit_type'][0]} {o['origin']}" + (f"/{o['origin_coast']}" if o.get("origin_coast") else "")
    tgt = (o.get("target") or "") + (f"/{o['target_coast']}" if o.get("target_coast") else "")
    if t == "MOVE": s = f"{u}-{tgt}" + (" VIA" if o.get("via_convoy") else "")
    elif t == "SUPPORT": s = f"{u} S {o.get('aux_unit_origin')}" + (f"-{tgt}" if tgt and tgt != o.get("aux_unit_origin") else "")
    elif t == "CONVOY": s = f"{u} C {o.get('aux_unit_origin')}-{tgt}"
    elif t == "HOLD": s = f"{u} H"
    elif t in ("BUILD", "WAIVE"): s = f"{t} {o['unit_type'][0] + ' ' if t == 'BUILD' else ''}{o['origin']}"
    else: s = f"{u} {t}" + (f" {tgt}" if tgt else "")
    return s + ("" if o.get("is_explicit") else "*")


def print_turn(h):
    """One resolved turn from GET /api/history/N: every power's orders with how they went."""
    r = h["resolution"]; res = r["resolutions"]
    print(turn_of(h), "->", r["next_season"], r["next_year"], r["next_phase"], "| winner", r["winner"], "| * = not ordered")
    by = {}
    for o in h["orders"].values():
        x = res.get(o["unit_id"], {})
        flag = "" if x.get("succeeded") else " FAIL"
        flag += " bounced" if x.get("bounced") else ""; flag += " CUT" if x.get("cut") else ""
        flag += f" DISLODGED by {x.get('dislodged_by')}" if x.get("dislodged") else ""
        by.setdefault(o["power"], []).append(ostr(o) + flag)
    for p, l in sorted(by.items()):
        print(f"  {p[:3]}: " + "; ".join(l))
    fmt = lambda own: " ".join(f"{k[:3]}={v}" for k, v in sorted(centres(own).items()))
    print("  centres before:", fmt(h["ownership"]), "| after:", fmt(r["new_ownership"]))


def parse(s, units, orders, power):
    t = re.sub(r"\s+", " ", s.strip().upper().replace("–", "-"))
    m = re.match(r"^DISBAND ([AF]) ([A-Z]{3})(?:/[A-Z]{2})?$", t)
    if m:
        t = f"{m[1]} {m[2]} D"
    # In a retreat phase the dislodged unit and the new occupier share a province: the caller's own unit wins.
    by_prov = {u["province"]: u for u in sorted(units, key=lambda u: u["power"] == power)}
    if t == "WAIVE":
        slot = next((o for o in orders.values() if o["power"] == power and o["order_type"] in ("WAIVE", "BUILD")), None)
        return None if slot is None else {**slot, "order_type": "WAIVE", "is_explicit": True}
    m = re.match(r"^BUILD ([AF]) ([A-Z]{3})(?:/([A-Z]{2}))?$", t)
    if m:
        # Build slots have one id per home centre (BUILD_FRANCE_BRE), and a build must use its own.
        slot = orders.get(f"BUILD_{power}_{m[2]}")
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


def submit_orders(power, order_strs, exit_on_error=True):
    g = call("GET", f"/api/game?power={power}", power=power)["state"]
    orders = [o for o in (parse(s, g["units"], g["orders"], power) for s in order_strs) if o]
    r = call("POST", "/api/orders/batch", {"power": power, "orders": orders, "turn": turn_of(g)}, power=power, exit_on_error=exit_on_error)
    return len(orders), [i.get("message", i) for i in r.get("issues", []) if i.get("power", power) == power]


def finalize(power, exit_on_error=True):
    """Finalize and describe it in one line. Until every player has finalized, the phase has not
    resolved: the state's `preview` is only a guess with everyone else holding."""
    g = call("GET", f"/api/game?power={power}", power=power)["state"]
    before = turn_of(g)
    r = call("POST", "/api/finalize", {"power": power, "force": True, "turn": before}, power=power, exit_on_error=exit_on_error)
    s = r["state"]
    if turn_of(s) != before:
        return f"finalized; {before} has RESOLVED, now {turn_of(s)} (see `history`)"
    return f"finalized {power} for {before}; NOT resolved yet (the preview is not a result), finalized so far: {', '.join(sorted(s['finalized_powers']))}"


def show_state():
    g = call("GET", "/api/game")["state"]
    me = POWER
    print(f"{turn_of(g)} | winner={g['winner']} | finalized={g['finalized_powers']} | surrendered={g['surrendered_powers']}")
    by = {}
    for u in g["units"]:
        by.setdefault(u["power"], []).append(f"{u['unit_type'][0]} {u['province']}{'/' + u['coast'] if u.get('coast') else ''}{'(DISLODGED)' if u['is_dislodged'] else ''}")
    sc = centres(g["ownership"])
    for p, us in sorted(by.items()):
        print(f"  {p} ({sc.get(p, 0)} centres): {', '.join(us)}")
    print("  supply centres:", {p: ", ".join(sorted(k for k, v in g['ownership'].items() if v == p and k in SCS)) for p in sorted(by)})
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
            what = f"BUILD {o['unit_type'][0]}" if o["order_type"] == "BUILD" else "WAIVE"
            print(f"  build slot {o['unit_id']}: {what} {o['origin']}")
    if g["issues"]:
        print("  issues:", [i.get("message", i) for i in g["issues"]][:8])
    return g


def ident(power):
    return {"user_id": "sim_" + power.lower(), "email": power.lower() + "@sim.test", "display_name": power.title()}


def self_test():
    """One scripted year on a fresh game: moves, a dislodgement and its retreat, builds, a waive and
    a disband, all through the same commands the players use. Exits non-zero on the first failure."""
    from selftest import run

    run(sys.modules[__name__])


def main():
    global GAME
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    cmd = a[0]
    if cmd == "--self-test":
        self_test()
    elif cmd == "create":
        r = call("POST", "/api/games", {"name": a[1], "creator_power": a[2].upper(), **ident(a[2].upper()), "is_private": True, "passcode": "sim"}, power=a[2].upper())
        print(r["game_id"])
    elif cmd == "join":
        call("POST", f"/api/games/{GAME}/join", {"power": POWER, "passcode": "sim", **ident(POWER)})
        print("joined", POWER)
    elif cmd == "state":
        show_state()
    elif cmd == "orders":
        n, issues = submit_orders(POWER, a[1:])
        print("accepted", n, "orders; issues:", issues[:8])
    elif cmd == "finalize":
        print(finalize(POWER))
    elif cmd == "unfinalize":
        call("POST", "/api/unfinalize", {"power": POWER})
        print("unfinalized")
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
        if len(a) > 1:
            print_turn(call("GET", f"/api/history/{a[1]}"))
        else:
            for t in call("GET", "/api/history"):
                print(f"  {t['index']}: {turn_of(t)}")
    elif cmd == "raw":
        print(json.dumps(call(a[1], a[2], json.loads(a[3]) if len(a) > 3 else None), indent=1))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
