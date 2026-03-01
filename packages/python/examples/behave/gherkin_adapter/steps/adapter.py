from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence

from alumnium import Alumni


@dataclass(frozen=True)
class GherkinStep:
    """Immutable value object carrying everything a Gherkin step contributes."""

    keyword: str
    text: str
    doc_string: Optional[str] = None
    data_table: Optional[Sequence[Sequence[str]]] = None
    location: Optional[str] = None


class AlumniumGherkinAdapter:
    """Routes Gherkin steps to Alumni.do() or Alumni.check().

    Given/When steps call al.do(text) — the LLM plans and executes browser actions.
    Then steps call al.check(text) — the LLM asserts the statement is true.
    And/But/* inherit the role of the preceding primary keyword.

    Usage::

        adapter = AlumniumGherkinAdapter(al, include_doc_string=True, include_data_table=True)
        adapter.dispatch(GherkinStep("Given", "navigate to 'https://example.com'"))
    """

    def __init__(
        self,
        al: Alumni,
        *,
        include_doc_string: bool = False,
        include_data_table: bool = False,
    ) -> None:
        self._al = al
        self._include_doc_string = include_doc_string
        self._include_data_table = include_data_table
        self._last_primary: Optional[str] = None

    def dispatch(self, step: GherkinStep) -> None:
        """Dispatch a step to the appropriate Alumni method.

        Raises:
            AssertionError: When a Then step assertion fails.
            RuntimeError: When any other Alumni error occurs.
        """
        primary = self._resolve(step.keyword)
        self._last_primary = primary
        payload = self._build_payload(step)
        try:
            if primary == "Then":
                self._al.check(payload)
            else:
                self._al.do(payload)
        except AssertionError:
            raise
        except Exception as exc:
            loc = f" at {step.location}" if step.location else ""
            raise RuntimeError(f"Alumnium error on '{step.keyword} {step.text}'{loc}") from exc

    def _resolve(self, keyword: str) -> str:
        """Resolve And/But/* to the preceding primary keyword."""
        if keyword in ("Given", "When", "Then"):
            return keyword
        return self._last_primary or "When"

    def _build_payload(self, step: GherkinStep) -> str:
        payload = step.text
        if self._include_doc_string and step.doc_string:
            payload += "\n\n" + step.doc_string
        if self._include_data_table and step.data_table:
            rows = "\n".join(" | ".join(row) for row in step.data_table)
            payload += "\n\nData table:\n" + rows
        return payload
