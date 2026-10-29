"""The embedding retry loop (NFR-14) runs on its own thread and survives errors."""

import threading

from app.services import background


def test_the_loop_retries_on_its_interval_and_keeps_going_after_an_error(monkeypatch):
    calls = []
    ran_twice = threading.Event()

    def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("database restarting")
        ran_twice.set()
        return 0

    monkeypatch.setattr(background, "retry_once", flaky)
    stop = background.start_retry_loop(interval_seconds=0.01)
    try:
        assert ran_twice.wait(timeout=2)
    finally:
        stop.set()
