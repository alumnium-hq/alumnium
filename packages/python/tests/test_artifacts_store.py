from alumnium.artifacts_store import ArtifactsStore, _kebab_case

# A valid 1x1 transparent PNG, base64-encoded.
PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="


def test_kebab_case():
    assert _kebab_case("Click the Login Button!") == "click-the-login-button"
    assert _kebab_case("") == "step"
    assert len(_kebab_case("a" * 100)) == 50


def test_save_screenshot_writes_file_and_returns_typed_artifact(tmp_path):
    store = ArtifactsStore("sess1", str(tmp_path))
    artifact = store.save_screenshot(1, "Click login", PNG_1X1)

    assert artifact is not None
    assert artifact.kind == "screenshot"
    assert artifact.mime == "image/png"
    assert artifact.path.exists()
    assert artifact.path.name == "01-click-login.png"
    assert artifact.path.parent == tmp_path / "sess1" / "screenshots"


def test_save_screenshot_non_fatal_on_bad_input(tmp_path):
    store = ArtifactsStore("sess1", str(tmp_path))
    # Invalid base64 must not raise — capture failures are best-effort.
    assert store.save_screenshot(1, "x", "A") is None


def test_trace_path_is_under_session_dir(tmp_path):
    store = ArtifactsStore("sess1", str(tmp_path))
    assert store.trace_path == tmp_path / "sess1" / "trace.zip"
    assert not store.trace_path.exists()
