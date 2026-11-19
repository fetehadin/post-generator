"""A circuit breaker per model and key: stop calling what is known to be down.

Without it, every draft first waits on a model that is failing (seen live in Nov 2026: Gemini
timed out for two weeks and each draft lost ~24 s before Groq answered). The breaker
remembers failures across requests:

- A failure that says how long it lasts (a daily quota "retry in 20h", a rejected key, a
  removed model) opens the breaker for that long, capped.
- Short failures (timeouts, 5xx, a per-minute 429) open it only after `threshold` in a row,
  for `base` seconds, doubling on each further failure up to `cap`.
- When the time is up, the next call goes through as a test ("half-open"). Success closes the
  breaker; failure opens it again for longer.

State lives in this process. With several API processes each learns on its own, which costs
at most `threshold` slow calls per process; a shared store (Redis) can replace the dicts
when the app runs on more than one machine.
"""

import threading
import time
from collections.abc import Callable


class CircuitBreaker:
    def __init__(
        self,
        clock: Callable[[], float] = time.monotonic,
        threshold: int = 3,
        base: float = 60.0,
        cap: float = 900.0,
        longest: float = 6 * 3600.0,
    ) -> None:
        self._clock = clock
        self.threshold, self.base, self.cap, self.longest = threshold, base, cap, longest
        self._open_until: dict[str, float] = {}
        self._failures: dict[str, int] = {}
        self._lock = threading.Lock()

    def paused_for(self, key: str) -> float | None:
        """Seconds until `key` may be tried again, or None when it may be tried now."""
        with self._lock:
            until = self._open_until.get(key)
        if until is None:
            return None
        left = until - self._clock()
        return left if left > 0 else None

    def success(self, key: str) -> None:
        with self._lock:
            self._open_until.pop(key, None)
            self._failures.pop(key, None)

    def failure(self, key: str, hold: float | None = None) -> None:
        """Record one failed call. `hold`: how long the failure is known to last, if it says."""
        with self._lock:
            count = self._failures.get(key, 0) + 1
            self._failures[key] = count
            if hold is not None:
                pause = min(hold, self.longest)
            elif count >= self.threshold:
                pause = min(self.cap, self.base * 2 ** (count - self.threshold))
            else:
                return
            self._open_until[key] = self._clock() + pause
