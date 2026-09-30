import time
from functools import wraps
from types import FunctionType
from typing import TYPE_CHECKING, Literal, cast

from .step_metrics import StepMetrics

if TYPE_CHECKING:
    from ..alumni import Alumni


def record_metrics(method: FunctionType):
    """
    Records one `StepMetrics` entry per public `do()`/`check()`/`get()` call.

    Wraps the retried method, so duration and tokens cover every attempt and the outcome is
    decided by whether the call ultimately raised. The label is the method's first argument.
    """

    kind = cast(Literal["do", "check", "get"], method.__name__)

    @wraps(method)
    def wrapper(self: "Alumni", label: str, *args, **kwargs):
        started_at = time.time()
        monotonic_start = time.monotonic()
        tokens_before = self.client.tokens_total
        outcome: Literal["passed", "failed"] = "passed"
        try:
            return method(self, label, *args, **kwargs)
        except Exception:
            outcome = "failed"
            raise
        finally:
            duration = time.monotonic() - monotonic_start
            artifact = self._capture_screenshot(label)
            self._steps.append(
                StepMetrics(
                    kind=kind,
                    label=label,
                    outcome=outcome,
                    started_at=started_at,
                    finished_at=time.time(),
                    duration=duration,
                    tokens=self.client.tokens_total - tokens_before,
                    artifacts=[artifact] if artifact is not None else [],
                )
            )

    return wrapper
