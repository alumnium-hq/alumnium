"""Test that describe() captures modal/overlay states like datepickers."""


def test_describe_captures_datepicker_state(al, navigate):
    """Test that describe() includes information about open datepicker modal."""
    navigate("https://www.airbnb.com")

    # Click "When" to open the datepicker
    al.do("click When in search bar")

    print("\n" + "="*80)
    print("🔍 Describing airbnb.com AFTER opening datepicker...")
    print("="*80)

    description = al.describe(vision=False)

    print("\n" + description + "\n")
    print("="*80)
    print(f"📊 Token usage: {al.stats}")
    print("="*80)

    # Assertions to verify datepicker is captured
    assert isinstance(description, str)
    assert len(description) > 0

    # The description should mention calendar/datepicker/dates
    description_lower = description.lower()
    has_calendar_info = any(keyword in description_lower for keyword in [
        "calendar", "date", "datepicker", "month", "day", "check-in", "check-out"
    ])

    if not has_calendar_info:
        print("\n⚠️  WARNING: Description does not appear to include datepicker/calendar information!")
        print("Description should mention calendar, dates, or date selection UI")

    assert has_calendar_info, "Description should include information about the open datepicker"
