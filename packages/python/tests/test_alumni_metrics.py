import pytest

from alumnium.alumni import Alumni
from alumnium.artifacts_store import ArtifactsStore
from alumnium.metrics import TokenUsage

# A valid 1x1 transparent PNG, base64-encoded.
PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


class _FakeDriver:
    @property
    def screenshot(self) -> str:
        return PNG_1X1


class _FakeClient:
    def __init__(self, stats: dict):
        self._stats = stats
        self.last_usage: dict = {}

    @property
    def stats(self) -> dict:
        return self._stats


def _make_alumni(tmp_path, stats: dict | None = None) -> Alumni:
    """Build an Alumni instance without a live server/driver to exercise metrics recording."""
    al = object.__new__(Alumni)
    al.driver = _FakeDriver()
    al.client = _FakeClient(stats or {"total": {}, "cache": {}})
    al._artifacts = ArtifactsStore("sess", str(tmp_path))
    al._steps = []
    al._step_counter = 0
    al._metric_usage = TokenUsage()
    al._metrics_started_at = 100.0
    return al


def test_record_step_passed_captures_tokens_and_artifact(tmp_path):
    al = _make_alumni(tmp_path)
    with al._record_step("do", "click button"):
        al._metric_usage = TokenUsage(input_tokens=7, total_tokens=7)

    assert len(al._steps) == 1
    step = al._steps[0]
    assert step.kind == "do"
    assert step.label == "click button"
    assert step.outcome == "passed"
    assert step.tokens.input_tokens == 7
    assert step.finished_at >= step.started_at
    assert step.duration >= 0
    assert len(step.artifacts) == 1
    assert step.artifacts[0].kind == "screenshot"
    assert step.artifacts[0].path.exists()


def test_record_step_failed_on_exception_and_reraises(tmp_path):
    al = _make_alumni(tmp_path)
    with pytest.raises(AssertionError):
        with al._record_step("check", "total is 5"):
            raise AssertionError("nope")

    assert len(al._steps) == 1
    assert al._steps[0].outcome == "failed"
    assert al._steps[0].kind == "check"


def test_metrics_property_uses_server_totals_and_ordered_steps(tmp_path):
    al = _make_alumni(tmp_path, stats={"total": {"input_tokens": 42}, "cache": {"cache_read": 3}})
    with al._record_step("get", "cart total"):
        al._metric_usage = TokenUsage(input_tokens=42, total_tokens=42)

    metrics = al.metrics
    assert metrics.tokens.total.input_tokens == 42
    assert metrics.tokens.cache.cache_read == 3
    assert len(metrics.steps) == 1
    assert metrics.steps[0].kind == "get"
    assert metrics.last is metrics.steps[-1]
    assert metrics.duration >= 0
