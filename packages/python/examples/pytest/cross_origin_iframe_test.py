from os import getenv

from pytest import mark


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Cross-origin iframe support is only implemented for Playwright and Selenium",
)
def test_cross_origin_iframe_button(al, navigate):
    """Test that buttons inside cross-origin iframes can be accessed and clicked."""
    navigate("cross_origin_iframe.html")

    # Verify main page element is accessible
    assert al.get("button that says 'Main Page Button'") == "Main Page Button"

    # Test cross-origin iframe button click
    # This tests the Playwright fallback code path for cross-origin iframes
    al.do("click button that says 'Click Me Inside Iframe'")

    # Verify the click triggered the JavaScript event handler
    assert al.get("text that says 'Button Clicked!'") == "Button Clicked!"


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Cross-origin iframe support is only implemented for Playwright and Selenium",
)
def test_cross_origin_iframe_link(al, navigate):
    """Test that links inside cross-origin iframes can be accessed and clicked."""
    navigate("cross_origin_iframe.html")

    # Test cross-origin iframe link click
    al.do("click link that says 'Iframe Link'")

    # Verify the click triggered the JavaScript event handler
    assert al.get("text that says 'Link Clicked!'") == "Link Clicked!"


@mark.xfail(
    "appium" in getenv("ALUMNIUM_DRIVER", "selenium"),
    reason="Cross-origin iframe support is only implemented for Playwright and Selenium",
)
def test_mixed_origin_iframes(al, navigate):
    """Test that both main page and cross-origin iframe elements are accessible in same tree."""
    navigate("cross_origin_iframe.html")

    # Verify we can access elements from both origins in the same accessibility tree
    main_button = al.get("button that says 'Main Page Button'")
    iframe_button = al.get("button that says 'Click Me Inside Iframe'")

    assert main_button == "Main Page Button"
    assert iframe_button == "Click Me Inside Iframe"
