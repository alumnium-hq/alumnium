from alumnium.drivers.playwright_driver import PlaywrightDriver
from alumnium.drivers.selenium_driver import SeleniumDriver


class _FakeTracing:
    def __init__(self, start_error: Exception | None = None):
        self.start_error = start_error
        self.started = False
        self.stopped_with: list[str | None] = []

    def start(self, screenshots: bool = False, snapshots: bool = False):
        if self.start_error:
            raise self.start_error
        self.started = True

    def stop(self, path: str | None = None):
        self.stopped_with.append(path)
        if path:
            open(path, "w").close()


class _FakeContext:
    def __init__(self, tracing: _FakeTracing):
        self.tracing = tracing


class _FakePage:
    def __init__(self, tracing: _FakeTracing):
        self.context = _FakeContext(tracing)
        self.closed = False

    def close(self):
        self.closed = True


def _make_driver(trace: bool, start_error: Exception | None = None) -> tuple[PlaywrightDriver, _FakePage]:
    """Build a PlaywrightDriver without a live browser to exercise the trace lifecycle."""
    page = _FakePage(_FakeTracing(start_error))
    driver = object.__new__(PlaywrightDriver)
    driver.page = page  # type: ignore[assignment]
    driver._tracing = False
    if trace:
        driver._start_tracing()
    return driver, page


def test_save_trace_writes_archive_when_tracing_enabled(tmp_path):
    driver, page = _make_driver(trace=True)
    path = tmp_path / "session" / "trace.zip"

    assert driver.save_trace(path) is True
    assert path.exists()
    assert page.context.tracing.stopped_with == [str(path)]

    # The trace is already claimed, so quitting does not stop tracing again.
    driver.quit()
    assert page.context.tracing.stopped_with == [str(path)]
    assert page.closed


def test_save_trace_is_noop_when_tracing_disabled(tmp_path):
    driver, page = _make_driver(trace=False)
    path = tmp_path / "trace.zip"

    assert driver.save_trace(path) is False
    assert not path.exists()
    assert page.context.tracing.stopped_with == []


def test_start_tracing_tolerates_context_already_traced(tmp_path):
    driver, _ = _make_driver(trace=True, start_error=RuntimeError("Tracing has already been started"))

    assert driver._tracing is False
    assert driver.save_trace(tmp_path / "trace.zip") is False


def test_quit_stops_unclaimed_trace():
    driver, page = _make_driver(trace=True)
    driver.quit()

    assert page.context.tracing.stopped_with == [None]
    assert page.closed


def test_other_drivers_do_not_support_tracing(tmp_path):
    driver = object.__new__(SeleniumDriver)
    assert driver.save_trace(tmp_path / "trace.zip") is False
