"""Debug test to see accessibility tree after opening datepicker."""


def test_debug_datepicker_accessibility_tree(al, navigate):
    """Check what's in the accessibility tree after opening datepicker."""
    navigate("https://www.airbnb.com")

    # Click "When" to open the datepicker
    al.do("click When in search bar")

    # Get the accessibility tree
    from alumnium.clients.native_client import NativeClient
    client: NativeClient = al.client  # type: ignore
    tree = client.session.process_tree(al.driver.accessibility_tree.to_str())

    print("\n" + "="*80)
    print("🌳 Accessibility Tree (first 200 lines):")
    print("="*80)

    tree_lines = tree.to_xml().split("\n")
    for i, line in enumerate(tree_lines[:200], 1):
        print(f"{i:3d}: {line}")

    print("\n" + "="*80)
    print(f"Total lines: {len(tree_lines)}")
    print("="*80)
