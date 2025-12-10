"""Test the describe() method with vision on various websites."""


def test_describe_airbnb_with_vision(al, navigate):
    """Test describe() with vision on airbnb.com."""
    navigate("https://www.airbnb.com")

    print("\n" + "="*80)
    print("🔍 Describing airbnb.com WITH VISION (screenshot)...")
    print("="*80)

    description = al.describe(vision=True)

    print("\n" + description + "\n")
    print("="*80)
    print(f"📊 Token usage: {al.stats}")
    print("="*80)

    # Basic assertions
    assert isinstance(description, str)
    assert len(description) > 0
    assert "# Page Description" in description
