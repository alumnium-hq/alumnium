"""Test the describe() method on various websites."""


def test_describe_airbnb(al, navigate):
    """Test describe() on airbnb.com."""
    navigate("https://www.airbnb.com")

    print("\n" + "="*80)
    print("🔍 Describing airbnb.com...")
    print("="*80)

    description = al.describe()

    print("\n" + description + "\n")
    print("="*80)
    print(f"📊 Token usage: {al.stats}")
    print("="*80)

    # Basic assertions
    assert isinstance(description, str)
    assert len(description) > 0
    assert "# Page Description" in description
