from alumnium.metrics import SessionMetrics, SessionTokens, StepMetrics, TokenUsage


def test_token_usage_from_dict_defaults_and_ignores_unknown():
    usage = TokenUsage.from_dict({"input_tokens": 3, "output_tokens": 4, "unknown": 99})
    assert usage.input_tokens == 3
    assert usage.output_tokens == 4
    assert usage.total_tokens == 0
    assert usage.reasoning == 0


def test_token_usage_from_dict_none():
    assert TokenUsage.from_dict(None) == TokenUsage()


def test_token_usage_add_is_pure():
    a = TokenUsage(input_tokens=1, output_tokens=2, total_tokens=3)
    b = TokenUsage(input_tokens=4, output_tokens=5, total_tokens=6, reasoning=7)
    total = a + b
    assert total == TokenUsage(input_tokens=5, output_tokens=7, total_tokens=9, reasoning=7)
    # Operands are not mutated.
    assert a.input_tokens == 1
    assert b.reasoning == 7


def test_session_tokens_from_dict_mirrors_server_shape():
    tokens = SessionTokens.from_dict({"total": {"input_tokens": 10}, "cache": {"cache_read": 2}})
    assert tokens.total.input_tokens == 10
    assert tokens.cache.cache_read == 2


def test_session_metrics_last():
    metrics = SessionMetrics(started_at=0.0, finished_at=1.0, duration=1.0)
    assert metrics.last is None

    step = StepMetrics(kind="do", label="x", outcome="passed", started_at=0.0, finished_at=0.5, duration=0.5)
    metrics.steps.append(step)
    assert metrics.last is step
