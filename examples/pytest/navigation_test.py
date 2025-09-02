from pytest import mark


@mark.describe("Back navigation")
@mark.xfail(reason="https://github.com/alumnium-hq/alumnium/pull/154")
def test_navigate_back_uses_history(al, navigate):
    # Arrange: create history with two pages
    navigate("https://example.com")
    assert "example.com" in al.driver.url

    al.do("Click on More information")
    assert "www.iana.org" in al.driver.url

    # Act: ask the agent to go back to the previous page
    al.do("Navigate back to the previous page")

    # Assert: we are back on the first page
    assert "example.com" in al.driver.url


@mark.describe("Back navigation - different phrases")
@mark.xfail(reason="https://github.com/alumnium-hq/alumnium/pull/154")
def test_back_navigation_different_phrases(al, navigate):
    """Test that different ways of asking to go back work without explicit learning examples."""
    # Arrange: create history with two pages
    navigate("https://example.com")
    assert "example.com" in al.driver.url

    al.do("Click on More information")
    assert "www.iana.org" in al.driver.url

    # Test different ways to ask for back navigation
    test_phrases = ["Go back", "Navigate back", "Return to the previous page"]

    for phrase in test_phrases:
        # Go forward again to test going back
        if "example.com" in al.driver.url:
            al.do("Click on More information")
            assert "www.iana.org" in al.driver.url

        # Test the back navigation phrase
        al.do(phrase)
        assert "example.com" in al.driver.url, f"Failed with phrase: '{phrase}'"
