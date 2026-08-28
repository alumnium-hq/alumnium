import re
from base64 import b64decode
from pathlib import Path

from .logutils import get_logger
from .metrics import Artifact

logger = get_logger(__name__)


def _kebab_case(text: str) -> str:
    """Sanitize a label into a filesystem-safe, kebab-cased slug (max 50 chars)."""
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return slug[:50] or "step"


class ArtifactsStore:
    """Writes per-session execution artifacts (screenshots, traces) to disk.

    Mirrors the MCP server's artifacts store: files live under
    ``<base>/<session_id>/`` where ``<base>`` defaults to ``~/.alumnium/artifacts``
    and can be overridden with the ``ALUMNIUM_ARTIFACTS_DIR`` environment variable.
    """

    def __init__(self, session_id: str, base_dir: str | None = None):
        root = Path(base_dir).expanduser() if base_dir else Path.home() / ".alumnium" / "artifacts"
        self.dir = root / str(session_id)
        self._screenshots_dir = self.dir / "screenshots"

    def save_screenshot(self, step_num: int, label: str, screenshot: str) -> Artifact | None:
        """Save a base64-encoded PNG screenshot for a step. Returns None on failure (non-fatal)."""
        try:
            filename = f"{step_num:02d}-{_kebab_case(label)}.png"
            self._screenshots_dir.mkdir(parents=True, exist_ok=True)
            path = self._screenshots_dir / filename
            path.write_bytes(b64decode(screenshot))
            logger.debug(f"Saved screenshot to {path}")
            return Artifact(path=path, kind="screenshot", mime="image/png")
        except Exception as e:
            logger.warning(f"Failed to save screenshot: {e}")
            return None

    @property
    def trace_path(self) -> Path:
        """Path where a Playwright trace archive is written (on quit)."""
        return self.dir / "trace.zip"
