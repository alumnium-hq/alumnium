from alumnium.metrics import SessionMetrics, StepMetrics, Tokens, TokenUsage


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
    assert a.input_tokens == 1
    assert b.reasoning == 7


def test_token_usage_sub_is_pure():
    after = TokenUsage(input_tokens=10, output_tokens=8, total_tokens=18, reasoning=4)
    before = TokenUsage(input_tokens=4, output_tokens=3, total_tokens=7)
    delta = after - before
    assert delta == TokenUsage(input_tokens=6, output_tokens=5, total_tokens=11, reasoning=4)
    assert after.input_tokens == 10
    assert before.input_tokens == 4


def test_token_usage_sub_does_not_clamp():
    """Mirrors the server's `subtractLlmUsage`, which subtracts field-wise without clamping."""
    delta = TokenUsage(input_tokens=1) - TokenUsage(input_tokens=4)
    assert delta.input_tokens == -3


def test_tokens_from_dict_reads_total_and_cached():
    tokens = Tokens.from_dict({"total": {"input_tokens": 10}, "cached": {"input_tokens": 4}})
    assert tokens.total.input_tokens == 10
    assert tokens.cached.input_tokens == 4


def test_tokens_paid_is_total_minus_cached():
    tokens = Tokens(total=TokenUsage(input_tokens=10, output_tokens=5), cached=TokenUsage(input_tokens=4))
    assert tokens.paid.input_tokens == 6
    assert tokens.paid.output_tokens == 5


def test_tokens_add_and_sub_are_field_wise():
    a = Tokens(total=TokenUsage(input_tokens=5), cached=TokenUsage(input_tokens=2))
    b = Tokens(total=TokenUsage(input_tokens=1), cached=TokenUsage(input_tokens=1))
    assert (a + b).total.input_tokens == 6
    assert (a - b).cached.input_tokens == 1


def test_session_metrics_last():
    metrics = SessionMetrics(started_at=0.0, finished_at=1.0, duration=1.0)
    assert metrics.last is None

    step = StepMetrics(kind="do", label="x", outcome="passed", started_at=0.0, finished_at=0.5, duration=0.5)
    metrics.steps.append(step)
    assert metrics.last is step
