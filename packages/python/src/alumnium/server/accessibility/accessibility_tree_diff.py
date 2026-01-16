from dataclasses import dataclass, field
from difflib import unified_diff


@dataclass
class AccessibilityTreeDiff:
    before_xml: str
    after_xml: str
    _diff: str = field(init=False, default="")

    def compute(self) -> str:
        if not self._diff:
            self._diff = self._format_as_git_diff()

        return self._diff

    def _format_as_git_diff(self) -> str:
        before_lines = self.before_xml.splitlines(keepends=True)
        after_lines = self.after_xml.splitlines(keepends=True)

        # Ensure last lines have newlines for consistent diff output
        if before_lines and not before_lines[-1].endswith("\n"):
            before_lines[-1] += "\n"
        if after_lines and not after_lines[-1].endswith("\n"):
            after_lines[-1] += "\n"

        diff = unified_diff(
            before_lines,
            after_lines,
            fromfile="before",
            tofile="after",
        )

        return "".join(diff).rstrip("\n")
