"""
Test helper: read a WebSocket message with a time limit.

Starlette's test client waits forever in `receive_json`, so a broadcast the server never sends
would hang the test run. `receive_json(ws)` fails the test instead.
"""
import threading
from typing import Any, Dict

RECEIVE_TIMEOUT_SECONDS = 5.0


def receive_json(ws: Any, timeout: float = RECEIVE_TIMEOUT_SECONDS) -> Any:
    """Return the next JSON message on `ws`, or fail if none arrives within `timeout` seconds."""
    outcome: Dict[str, Any] = {}

    def read() -> None:
        try:
            outcome["message"] = ws.receive_json()
        except BaseException as ex:  # handed to the test thread below
            outcome["error"] = ex

    # The reader thread is left blocked if nothing arrives. Closing the socket when the test's
    # `with` block exits ends its wait, and as a daemon it never keeps the run alive.
    reader = threading.Thread(target=read, name="ws-receive", daemon=True)
    reader.start()
    reader.join(timeout)
    if reader.is_alive():
        raise AssertionError(f"No WebSocket message arrived within {timeout:g}s")
    if "error" in outcome:
        raise outcome["error"]
    return outcome["message"]
