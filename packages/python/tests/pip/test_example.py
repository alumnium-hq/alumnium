from playwright.sync_api import sync_playwright

from alumnium import Alumni


def test_alumni_works() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()

        try:
            al = Alumni(page)
            page.goto("https://seleniumbase.io/apps/calculator")
            al.do("2 + 2 =")
            result = al.get("calculator result from textfield")

            assert result == 4
        finally:
            browser.close()
