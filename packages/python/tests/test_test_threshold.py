from pytest import raises

from examples.test_threshold import evaluate_pass_threshold, get_pass_threshold


def test_pass_threshold_defaults_to_strict(monkeypatch):
    monkeypatch.delenv("ALUMNIUM_TEST_PASS_THRESHOLD_PCT", raising=False)
    assert get_pass_threshold() == 100


def test_pass_threshold_accepts_boundary(monkeypatch):
    monkeypatch.setenv("ALUMNIUM_TEST_PASS_THRESHOLD_PCT", "75")
    accepted, message = evaluate_pass_threshold(3, 1)
    assert accepted
    assert message == "3/4 tests passed (75.00%, required 75%)"


def test_pass_threshold_rejects_below_boundary(monkeypatch):
    monkeypatch.setenv("ALUMNIUM_TEST_PASS_THRESHOLD_PCT", "75.1")
    assert not evaluate_pass_threshold(3, 1)[0]


def test_pass_threshold_rejects_empty_run(monkeypatch):
    monkeypatch.setenv("ALUMNIUM_TEST_PASS_THRESHOLD_PCT", "0")
    assert not evaluate_pass_threshold(0, 0)[0]


def test_pass_threshold_rejects_invalid_value(monkeypatch):
    monkeypatch.setenv("ALUMNIUM_TEST_PASS_THRESHOLD_PCT", "101")
    with raises(ValueError, match="must be a number from 0 to 100"):
        get_pass_threshold()
