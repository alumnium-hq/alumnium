from re import sub

from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class UploadTool(BaseTool):
    __doc__ = (
        "Upload one or more files using a button that opens a file chooser. "
        "This tool automatically clicks the button, DO NOT use ClickTool for that."
    )

    id: int = Field(description="Element identifier (ID) of the file input")
    paths: list[str] = Field(
        description="Absolute file path(s) to upload. Can be a single path or multiple paths for multi-file upload."
    )

    def invoke(self, driver: BaseDriver):
        driver.upload(self.id, self._normalize_paths(self.paths))  # type: ignore[reportAttributeAccessIssue]

    def _normalize_paths(self, paths):
        if isinstance(paths, str):
            paths = [paths]

        # Planner often attempts to "escape" file paths by adding backslashes
        normalized = []
        for path in paths:
            normalized_path = sub(r"\+/", "/", path)
            normalized.append(normalized_path)

        return normalized
