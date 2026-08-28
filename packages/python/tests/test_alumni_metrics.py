import pytest

from alumnium.alumni import Alumni, record_metrics
from alumnium.artifacts_store import ArtifactsStore
from alumnium.metrics import TokenUsage

# A valid 1x1 transparent PNG, base64-encoded.
PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


class _FakeDriver:
    @property
    def screenshot(self) -> str:
        return PNG_1X1


class _FakeClient:
    """Stands in for HttpClient: accrues a cumulative token total the decorator diffs against."""

    def __init__(self, stats: dict):
        self._stats = stats
        self.usage_total = TokenUsage()

    def spend(self, input_tokens: int) -> None:
        self.usage_total = self.usage_total + TokenUsage(input_tokens=input_tokens, total_tokens=input_tokens)

    @property
    def stats(self) -> dict:
        return self._stats


def _make_alumni(tmp_path, stats: dict | None = None, capture_screenshots: bool = True) -> Alumni:
    """Build an Alumni instance without a live server/driver to exercise metrics recording."""
    al = object.__new__(Alumni)
    al.driver = _FakeDriver()
    al.client = _FakeClient(stats or {"total": {}, "cache": {}})
    al.capture_screenshots = capture_screenshots
    al._artifacts = ArtifactsStore("sess", str(tmp_path))
    al._steps = []
    al._step_counter = 0
    al._metrics_started_at = 100.0
    return al


@record_metrics
def do(self, goal: str) -> str:
    self.client.spend(7)
    return goal


@record_metrics
def check(self, statement: str) -> str:
    self.client.spend(3)
    raise AssertionError("nope")


@record_metrics
def check_no_spend(self, statement: str) -> str:
    return statement


@record_metrics
def get(self, data: str) -> str:
    self.client.spend(42)
    return data


def test_record_metrics_passed_captures_tokens_and_artifact(tmp_path):
    al = _make_alumni(tmp_path)
    assert do(al, "click button") == "click button"

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


def test_record_metrics_failed_on_exception_and_reraises(tmp_path):
    al = _make_alumni(tmp_path)
    with pytest.raises(AssertionError):
        check(al, "total is 5")

    assert len(al._steps) == 1
    assert al._steps[0].outcome == "failed"
    assert al._steps[0].kind == "check"
    # Tokens spent before the failure are still attributed to the step.
    assert al._steps[0].tokens.input_tokens == 3


def test_record_metrics_skips_screenshots_when_disabled(tmp_path):
    al = _make_alumni(tmp_path, capture_screenshots=False)
    do(al, "click button")

    assert al._steps[0].artifacts == []
    assert not (tmp_path / "sess" / "screenshots").exists()


def test_record_metrics_reports_only_each_step_own_token_delta(tmp_path):
    """The client total is cumulative, so each step must report its own delta, not the running sum."""
    al = _make_alumni(tmp_path)
    get(al, "cart total")
    do(al, "click button")
    get(al, "cart total again")

    assert al.client.usage_total.input_tokens == 91
    assert [step.tokens.input_tokens for step in al._steps] == [42, 7, 42]


def test_record_metrics_records_zero_tokens_for_a_call_that_spends_nothing(tmp_path):
    al = _make_alumni(tmp_path)
    do(al, "click button")
    check_no_spend(al, "nothing happens")

    assert [step.tokens.input_tokens for step in al._steps] == [7, 0]


def test_metrics_property_uses_server_totals_and_ordered_steps(tmp_path):
    al = _make_alumni(tmp_path, stats={"total": {"input_tokens": 42}, "cache": {"cache_read": 3}})
    get(al, "cart total")

    metrics = al.metrics
    assert metrics.tokens.total.input_tokens == 42
    assert metrics.tokens.cache.cache_read == 3
    assert len(metrics.steps) == 1
    assert metrics.steps[0].kind == "get"
    assert metrics.last is metrics.steps[-1]
    assert metrics.duration >= 0
