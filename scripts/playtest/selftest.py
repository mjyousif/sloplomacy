"""`sim_client.py --self-test`: play one scripted year of 1901 on a fresh game through the same
commands the players use, and stop at the first step that does not come out as planned.

The year:
  Spring  France A PAR-PIC, A MAR-GAS, F BRE-MAO; Germany A MUN-BUR, F KIE-HOL; Italy A VEN-PIE.
  Fall    France A GAS-BUR supported by A PIC, F MAO-POR; Austria F TRI-VEN.
          The German army in Burgundy is dislodged from Gascony.
  Retreat Germany A BUR R RUH.
  Winter  France builds A PAR, Germany builds F KIE, Austria waives, Italy (two centres, three
          units) disbands A PIE.
Run it against a fresh backend before any agent starts: it takes a few seconds.
"""

import sys


def run(sim):
    def check(ok, what):
        print(("  ok   " if ok else "  FAIL ") + what)
        if not ok:
            sys.exit(1)

    def state(power="FRANCE"):
        return sim.call("GET", f"/api/game?power={power}", power=power)["state"]

    def unit_at(g, power, province):
        return next(
            (u for u in g["units"] if u["power"] == power and u["province"] == province), None
        )

    def play(orders):
        """Each power's orders, then every power whose finalize the phase waits for."""
        for power, strs in orders.items():
            n, issues = sim.submit_orders(power, strs, exit_on_error=False)
            check(n == len(strs) and not issues, f"{power} ordered {strs} (issues: {issues})")
        before = sim.turn_of(state())
        for power in sim.POWERS:
            if sim.turn_of(state()) != before:
                break
            if power not in state(power)["finalized_powers"]:
                line = sim.finalize(power, exit_on_error=False)
                check("finalized" in line, f"{power}: {line}")
        after = state()
        check(sim.turn_of(after) != before, f"{before} resolved, now {sim.turn_of(after)}")
        return after

    print(f"self-test against {sim.API}")
    sim.GAME = sim.call(
        "POST",
        "/api/games",
        {"name": "Self-test", "creator_power": "FRANCE", **sim.ident("FRANCE"),
         "is_private": True, "passcode": "sim"},
        power="FRANCE",
    )["game_id"]
    for power in sim.POWERS:
        if power != "FRANCE":
            sim.call("POST", f"/api/games/{sim.GAME}/join",
                     {"power": power, "passcode": "sim", **sim.ident(power)}, power=power)
    print(f"  game {sim.GAME}, seven seats")

    g = play({
        "FRANCE": ["A PAR - PIC", "A MAR - GAS", "F BRE - MAO"],
        "GERMANY": ["A MUN - BUR", "F KIE - HOL"],
        "ITALY": ["A VEN - PIE"],
    })
    check(sim.turn_of(g) == "Fall 1901 Movement", "Spring went straight to Fall")
    check(unit_at(g, "GERMANY", "BUR") is not None, "German army in Burgundy")

    g = play({
        "FRANCE": ["A GAS - BUR", "A PIC S A GAS - BUR", "F MAO - POR"],
        "AUSTRIA": ["F TRI - VEN"],
    })
    check(sim.turn_of(g) == "Fall 1901 Retreats", "a retreat phase for the dislodged army")
    record = sim.call("GET", "/api/history/1", power="FRANCE")
    dislodged = next(r for r in record["resolution"]["resolutions"].values() if r["dislodged"])
    check(dislodged["dislodged_by"] == "GAS", f"dislodged from Gascony ({dislodged['dislodged_by']})")

    g = play({"GERMANY": ["A BUR R RUH"]})
    check(sim.turn_of(g) == "Winter 1901 Adjustments", "the retreat led to winter")
    check(unit_at(g, "GERMANY", "RUH") is not None, "the German army retreated to the Ruhr")
    owed = {p: b["count"] for p, b in (g["builds"] or {}).items() if b.get("count")}
    check(owed == {"FRANCE": 1, "GERMANY": 1, "AUSTRIA": 1, "ITALY": -1}, f"adjustments owed {owed}")

    g = play({
        "FRANCE": ["BUILD A PAR"],
        "GERMANY": ["BUILD F KIE"],
        "AUSTRIA": ["WAIVE"],
        "ITALY": ["DISBAND A PIE"],
    })
    check(sim.turn_of(g) == "Spring 1902 Movement", "winter led to Spring 1902")
    count = {p: sum(u["power"] == p for u in g["units"]) for p in sim.POWERS}
    check(unit_at(g, "FRANCE", "PAR") is not None and unit_at(g, "GERMANY", "KIE") is not None,
          "France built in Paris and Germany in Kiel")
    check(count["ITALY"] == 2 and unit_at(g, "ITALY", "PIE") is None, "Italy disbanded in Piedmont")
    check(count["AUSTRIA"] == 3, "Austria waived its build")
    print("self-test passed")
