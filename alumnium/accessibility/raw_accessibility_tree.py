"""Raw accessibility tree wrapper for client-side usage."""


class RawAccessibilityTree:
    """
    Simple wrapper for raw accessibility tree data.
    All processing is done server-side.
    """

    def __init__(self, raw_data: dict | str, automation_type: str):
        """
        Args:
            raw_data: Raw accessibility tree data (CDP dict for Chromium, XML string for XCUITest/UIAutomator2)
            automation_type: Type of automation - "chromium", "xcuitest", or "uiautomator2"
        """
        self.raw_data = raw_data
        self.automation_type = automation_type
