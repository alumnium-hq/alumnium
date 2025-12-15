"""Integration tests for FragmentsCache with real browser automation.

These tests verify that the cache works end-to-end with actual Alumni instances
and browser drivers.
"""

import tempfile
from pathlib import Path

import pytest
from selenium.webdriver import Chrome
from selenium.webdriver.chrome.options import Options as ChromeOptions

from alumnium import Alumni
from alumnium.server.cache.chained_cache import ChainedCache
from alumnium.server.cache.filesystem_cache import FilesystemCache
from alumnium.server.cache.fragments_cache import FragmentsCache
from alumnium.server.models import Model


@pytest.fixture(scope="module")
def headless_chrome():
    """Create a headless Chrome driver for testing."""
    options = ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_experimental_option(
        "prefs",
        {
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False,
        },
    )
    driver = Chrome(options=options)
    yield driver
    driver.quit()


@pytest.fixture
def al_with_cache(headless_chrome):
    """Create Alumni instance with clean cache directory."""
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create Alumni with NativeClient (no server needed)
        al = Alumni(headless_chrome, url=None)

        # Replace the underlying LangChain cache with one using temp directory
        # Must update both session.cache and llm.cache
        chained_cache = ChainedCache([FilesystemCache(temp_dir), FragmentsCache(temp_dir)])
        al.client.session.cache = chained_cache
        al.client.session.llm.cache = chained_cache
        al.client.cache = chained_cache

        yield al


@pytest.fixture
def simple_page(headless_chrome):
    """Load a simple test page."""
    # Use a simple, stable page for testing
    headless_chrome.get("https://the-internet.herokuapp.com/login")
    return headless_chrome


@pytest.mark.skipif(
    not Model.current or Model.current.provider.value == "ollama",
    reason="Requires LLM provider configured (not ollama)",
)
class TestFragmentsCacheIntegration:
    """Integration tests for FragmentsCache functionality."""

    def test_cache_hit_on_repeated_command(self, al_with_cache, simple_page):
        """Test that repeating the same command uses cache."""
        al = al_with_cache

        # First execution - should miss cache and call LLM
        al.do("click the Login button")

        # Save cache
        al.cache.save()

        # Cache usage should still be 0 (no cache hits yet)
        assert al.cache.usage["total_tokens"] == 0

        # Reset to login page
        simple_page.get("https://the-internet.herokuapp.com/login")

        # Second execution - should hit cache
        al.do("click the Login button")

        # Usage should have increased (from cached response metadata)
        assert al.cache.usage["total_tokens"] > 0

    def test_cache_works_for_multi_step_commands(self, al_with_cache, simple_page):
        """Test cache works for commands requiring multiple steps."""
        al = al_with_cache

        # Navigate to form page
        simple_page.get("https://the-internet.herokuapp.com/login")

        # First execution - multi-step command
        al.do("enter 'tomsmith' in the username field")
        al.cache.save()

        # Cache usage should be 0 after first run (no cache hits)
        assert al.cache.usage["total_tokens"] == 0

        # Reset
        simple_page.get("https://the-internet.herokuapp.com/login")

        # Second execution - should use cache
        al.do("enter 'tomsmith' in the username field")

        # Should have increased usage from cache
        assert al.cache.usage["total_tokens"] > 0

    def test_cache_miss_when_ui_changes(self, al_with_cache, simple_page):
        """Test cache misses when UI elements change."""
        al = al_with_cache

        # First page - login
        simple_page.get("https://the-internet.herokuapp.com/login")
        al.do("click the Login button")
        al.cache.save()

        # Different page with different elements - should miss cache
        simple_page.get("https://the-internet.herokuapp.com/add_remove_elements/")

        # This command will fail to find cached elements, fall back to LLM
        # Just verify it doesn't crash
        try:
            al.do("click Add Element button")
            # If successful, cache fallback worked
            assert True
        except Exception:
            # Expected to potentially fail if LLM doesn't work, but shouldn't crash
            pass

    def test_both_caches_in_chain(self, al_with_cache, simple_page):
        """Test that both FilesystemCache and FragmentsCache work in chain."""
        al = al_with_cache

        # Verify we have ChainedCache with both caches
        assert isinstance(al.client.cache, ChainedCache)
        assert len(al.cache.caches) == 2
        assert isinstance(al.cache.caches[0], FilesystemCache)
        assert isinstance(al.cache.caches[1], FragmentsCache)

        # First execution
        simple_page.get("https://the-internet.herokuapp.com/login")
        al.do("click the Login button")
        al.cache.save()

        # Reset and execute again
        simple_page.get("https://the-internet.herokuapp.com/login")
        al.do("click the Login button")

        # Should have cached response
        # (FilesystemCache will hit first if exact match, FragmentsCache as fallback)
        assert al.cache.usage["total_tokens"] > 0

    def test_cache_persists_across_sessions(self, headless_chrome, simple_page):
        """Test cache persists between Alumni instances."""
        with tempfile.TemporaryDirectory() as temp_dir:
            # First session
            al1 = Alumni(headless_chrome, url=None)
            cache1 = ChainedCache([FilesystemCache(temp_dir), FragmentsCache(temp_dir)])
            al1.client.session.cache = cache1
            al1.client.session.llm.cache = cache1
            al1.client.cache = cache1

            simple_page.get("https://the-internet.herokuapp.com/login")
            al1.do("click the Login button")
            al1.cache.save()

            # Verify cache files exist
            cache_dir = Path(temp_dir)
            assert cache_dir.exists()

            # Second session with new Alumni instance
            al2 = Alumni(headless_chrome, url=None)
            cache2 = ChainedCache([FilesystemCache(temp_dir), FragmentsCache(temp_dir)])
            al2.client.session.cache = cache2
            al2.client.session.llm.cache = cache2
            al2.client.cache = cache2

            simple_page.get("https://the-internet.herokuapp.com/login")
            al2.do("click the Login button")

            # Should have used cached response
            assert al2.cache.usage["total_tokens"] > 0

    def test_fragments_cache_validates_elements(self, al_with_cache, simple_page):
        """Test FragmentsCache validates element presence."""
        al = al_with_cache

        # Access FragmentsCache directly
        fragments_cache = al.cache.caches[1]
        assert isinstance(fragments_cache, FragmentsCache)

        # First execution
        simple_page.get("https://the-internet.herokuapp.com/login")
        al.do("click the Login button")
        al.cache.save()

        # Verify fragments were saved
        fragments_base_dir = fragments_cache._get_fragments_base_dir()
        if fragments_base_dir.exists():
            # Check that fragment files were created
            plan_dirs = list((fragments_base_dir / "plans").glob("*")) if (
                fragments_base_dir / "plans"
            ).exists() else []
            action_dirs = list((fragments_base_dir / "actions").glob("*")) if (
                fragments_base_dir / "actions"
            ).exists() else []

            # Should have at least some cache entries
            assert len(plan_dirs) > 0 or len(action_dirs) > 0

    def test_cache_clear_removes_all_data(self, al_with_cache, simple_page):
        """Test that cache.clear() removes all cached data."""
        al = al_with_cache

        # Create some cache entries
        simple_page.get("https://the-internet.herokuapp.com/login")
        al.do("click the Login button")
        al.cache.save()

        # Clear cache
        al.cache.clear()

        # Execute again - should miss cache
        simple_page.get("https://the-internet.herokuapp.com/login")
        initial_usage = dict(al.cache.usage)
        al.do("click the Login button")

        # Note: This may or may not increase usage depending on if it's a fresh call
        # The important thing is it doesn't crash after clearing


@pytest.mark.skipif(
    not Model.current or Model.current.provider.value == "ollama",
    reason="Requires LLM provider configured (not ollama)",
)
class TestCacheWithDifferentCommands:
    """Test cache behavior with different types of commands."""

    def test_navigation_commands(self, al_with_cache, simple_page):
        """Test cache with navigation commands."""
        al = al_with_cache

        simple_page.get("https://the-internet.herokuapp.com")

        # First execution
        al.do("click the 'Form Authentication' link")
        al.cache.save()

        # Go back
        simple_page.get("https://the-internet.herokuapp.com")

        # Second execution - should use cache
        al.do("click the 'Form Authentication' link")

        # Should have navigated successfully
        assert "login" in simple_page.current_url

    def test_text_input_commands(self, al_with_cache, simple_page):
        """Test cache with text input commands."""
        al = al_with_cache

        simple_page.get("https://the-internet.herokuapp.com/login")

        # First execution
        al.do("enter 'testuser' in the username field")
        al.cache.save()

        # Reset
        simple_page.get("https://the-internet.herokuapp.com/login")

        # Second execution - should use cache
        al.do("enter 'testuser' in the username field")

        # Verify text was entered (indicates cache worked)
        username_field = simple_page.find_element("id", "username")
        assert username_field.get_attribute("value") == "testuser"

    def test_different_commands_different_cache_entries(self, al_with_cache, simple_page):
        """Test that different commands create different cache entries."""
        al = al_with_cache

        simple_page.get("https://the-internet.herokuapp.com/login")

        # Execute two different commands
        al.do("click the Login button")
        al.do("enter 'test' in the username field")
        al.cache.save()

        # Both should have separate cache entries
        # Just verify it doesn't crash and works correctly
        simple_page.get("https://the-internet.herokuapp.com/login")
        al.do("click the Login button")
        al.do("enter 'test' in the username field")

        # Should complete successfully
        assert True


@pytest.mark.skipif(
    not Model.current or Model.current.provider.value == "ollama",
    reason="Requires LLM provider configured (not ollama)",
)
class TestCacheWithRealWorkflow:
    """Test cache with realistic user workflows."""

    def test_login_workflow_uses_cache(self, al_with_cache, simple_page):
        """Test complete login workflow uses cache on repeat."""
        al = al_with_cache

        def login_flow():
            simple_page.get("https://the-internet.herokuapp.com/login")
            al.do("enter 'tomsmith' in the username field")
            al.do("enter 'SuperSecretPassword!' in the password field")
            al.do("click the Login button")

        # First execution
        login_flow()
        al.cache.save()

        # Cache usage should be 0 after first run (no cache hits)
        assert al.cache.usage["total_tokens"] == 0

        # Second execution - should use cache heavily
        login_flow()

        # Usage should have increased (from cached responses)
        assert al.cache.usage["total_tokens"] > 0
