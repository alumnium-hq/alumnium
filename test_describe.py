#!/usr/bin/env python3
"""Test script for the new describe() method."""

from selenium import webdriver
from selenium.webdriver.chrome.options import Options

import sys
sys.path.insert(0, "packages/python/src")

from alumnium import Alumni


def test_describe():
    """Test the describe method on airbnb.com."""
    # Setup Chrome with headless mode
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")

    driver = webdriver.Chrome(options=chrome_options)

    try:
        print("🌐 Navigating to airbnb.com...")
        driver.get("https://www.airbnb.com")

        # Wait for page to load
        import time
        time.sleep(3)

        print("\n📝 Creating Alumni instance...")
        al = Alumni(driver)

        print("\n🔍 Describing the page (without vision)...")
        description = al.describe()

        print("\n" + "="*80)
        print("PAGE DESCRIPTION:")
        print("="*80)
        print(description)
        print("="*80)

        print("\n📊 Token usage stats:")
        print(al.stats)

    finally:
        driver.quit()
        print("\n✅ Test completed!")


if __name__ == "__main__":
    test_describe()
