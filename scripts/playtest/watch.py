#!/usr/bin/env python3
"""Read-only spectator page for a playtest. python3 scripts/playtest/watch.py [port]  ->  http://127.0.0.1:8021
Env: SIM_API (default http://127.0.0.1:8020), SIM_GAME (game id).
Reads the game as each seat (omniscient view: all press, all live orders) and never writes."""
import base64, json, os, sys, time, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

API, GAME = os.environ.get("SIM_API", "http://127.0.0.1:8020"), os.environ.get("SIM_GAME", "proto_1901")
POWERS = ["AUSTRIA", "ENGLAND", "FRANCE", "GERMANY", "ITALY", "RUSSIA", "TURKEY"]
SCS = set("EDI LVP LON BRE PAR MAR KIE MUN BER VEN ROM NAP VIE BUD TRI STP MOS WAR SEV CON ANK SMY NWY SWE DEN HOL BEL SPA POR TUN SER RUM BUL GRE".split())


def get(path, power):
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    tok = f"{b({'alg': 'none', 'typ': 'JWT'})}.{b({'sub': 'sim_' + power.lower(), 'email': power.lower() + '@sim.test', 'exp': int(time.time()) + 3600})}."
    sep = "&" if "?" in path else "?"
    req = urllib.request.Request(f"{API}{path}{sep}game_id={GAME}", headers={"Authorization": f"Bearer {tok}"})
    return json.loads(urllib.request.urlopen(req, timeout=5).read())


def ostr(o):
    t = o["order_type"]; u = f"{o['unit_type'][0]} {o['origin']}"
    tgt = (o.get("target") or "") + (f"/{o['target_coast']}" if o.get("target_coast") else "")
    if t == "MOVE": return f"{u} - {tgt}"
    if t == "SUPPORT": return f"{u} S {o.get('aux_unit_origin')}" + (f" - {tgt}" if tgt and tgt != o.get("aux_unit_origin") else "")
    if t == "CONVOY": return f"{u} C {o.get('aux_unit_origin')} - {tgt}"
    if t == "HOLD": return f"{u} H"
    return f"{u} {t} {tgt}".strip()


def data():
    out = {"powers": {}, "press": {}}
    for p in POWERS:
        g = get("/api/game", p)["state"]
        out["phase"] = f"{g['season']} {g['year']} {g['phase']}"; out["winner"] = g["winner"]; out["finalized"] = g["finalized_powers"]
        out["powers"][p] = {
            "units": [f"{u['unit_type'][0]} {u['province']}" + (f"/{u['coast']}" if u.get("coast") else "") + (" (dislodged)" if u["is_dislodged"] else "") for u in g["units"] if u["power"] == p],
            "orders": [ostr(o) for o in g["orders"].values() if o["power"] == p and o.get("is_explicit")],
            "sc": sorted(k for k, v in g["ownership"].items() if v == p and k in SCS),
        }
        for m in get("/api/press", p)["messages"]:
            out["press"].setdefault(m["seq"], m)
            if m.get("sender"): out["press"][m["seq"]] = m
    out["press"] = [out["press"][k] for k in sorted(out["press"], reverse=True)]
    hist = get("/api/history", "FRANCE"); out["history"] = []
    for h in hist[-3:][::-1]:
        d = get(f"/api/history/{h['index']}", "FRANCE"); res = d["resolution"]["resolutions"]; rows = {}
        for o in d["orders"].values():
            x = res.get(o["unit_id"], {})
            tag = "" if x.get("succeeded") else (" ✗ bounced" if x.get("bounced") else " ✗ failed")
            tag += " (cut)" if x.get("cut") else ""; tag += " DISLODGED" if x.get("dislodged") else ""
            rows.setdefault(o["power"], []).append(ostr(o) + tag)
        out["history"].append({"title": f"{h['season']} {h['year']} {h['phase']}", "rows": rows})
    return out


PAGE = """<!doctype html><meta charset=utf-8><title>Playtest Watch</title>
<style>
:root{--bg:#f6f4ee;--fg:#1d1c19;--mut:#6b675e;--card:#fff;--line:#ddd8cb}
@media (prefers-color-scheme:dark){:root{--bg:#17181b;--fg:#e8e6e1;--mut:#9a968c;--card:#202226;--line:#33363c}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:16px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:20px 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.card b{font-size:15px}.mut{color:var(--mut)}.ok{color:#2e8b57}.pill{font-size:11px;border:1px solid var(--line);border-radius:10px;padding:1px 7px;margin-left:6px}
.msg{border-bottom:1px solid var(--line);padding:6px 0}.msg .h{font-size:12px;color:var(--mut)}
.cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}@media(max-width:800px){.cols{grid-template-columns:1fr}}
code{font:12px ui-monospace,monospace}
</style><h1 id=t>Loading…</h1><div class=mut id=s></div>
<h2>Powers (live orders are hidden from other players; you see all)</h2><div class=grid id=p></div>
<div class=cols><div><h2>Recent turns</h2><div id=h></div></div><div><h2>Press (all channels, newest first)</h2><div id=m></div></div></div>
<script>
const C={AUSTRIA:'#c0392b',ENGLAND:'#2c5fa8',FRANCE:'#3a9ad9',GERMANY:'#777',ITALY:'#3f9b4b',RUSSIA:'#8e5bb5',TURKEY:'#c9a227'};
const e=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function tick(){try{const d=await (await fetch('/data')).json();
 t.textContent='Playtest — '+d.phase+(d.winner?' — WINNER '+d.winner:'');
 s.textContent='Finalized: '+(d.finalized.join(', ')||'nobody yet')+' · refreshed '+new Date().toLocaleTimeString();
 p.innerHTML=Object.entries(d.powers).map(([k,v])=>`<div class=card style="border-top:4px solid ${C[k]}"><b>${k}</b><span class=pill>${v.sc.length} SC</span>${d.finalized.includes(k)?'<span class="pill ok">ready</span>':''}
  <div class=mut>${v.sc.join(' ')}</div><div><code>${v.units.map(e).join(' · ')||'no units'}</code></div>
  <div style="margin-top:6px">${v.orders.length?v.orders.map(o=>'<code>'+e(o)+'</code>').join('<br>'):'<span class=mut>no orders yet</span>'}</div></div>`).join('');
 h.innerHTML=d.history.map(x=>`<div class=card style="margin-bottom:8px"><b>${x.title}</b>${Object.entries(x.rows).map(([k,r])=>`<div><span style="color:${C[k]}">${k.slice(0,3)}</span> <code>${r.map(e).join(' · ')}</code></div>`).join('')}</div>`).join('')||'<span class=mut>nothing resolved yet</span>';
 m.innerHTML=d.press.map(x=>`<div class=msg><div class=h>#${x.seq} · ${x.season} ${x.year} · <b style="color:${C[x.sender]||'inherit'}">${x.sender||'anonymous'}</b>${x.anonymous?' (anon note)':''} → ${x.recipients.length?x.recipients.join(', '):'everyone'}</div>${e(x.body)}</div>`).join('');
}catch(err){s.textContent='Backend not reachable: '+err}}
tick();setInterval(tick,5000);
</script>"""


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            body, ct = (json.dumps(data()).encode(), "application/json") if self.path.startswith("/data") else (PAGE.encode(), "text/html; charset=utf-8")
            self.send_response(200)
        except Exception as ex:
            body, ct = json.dumps({"error": str(ex)}).encode(), "application/json"; self.send_response(502)
        self.send_header("Content-Type", ct); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    def log_message(self, *a): pass


ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 8021), H).serve_forever()
