from abc import abstractmethod
from typing import TYPE_CHECKING, Callable
from urllib.parse import urlparse

from retry import retry
from selenium.common.exceptions import MoveTargetOutOfBoundsException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.errorhandler import ElementNotInteractableException, JavascriptException
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

from .. import FULL_PAGE_SCREENSHOT
from ..logutils import get_logger
from ..tools.click_tool import ClickTool
from ..tools.drag_and_drop_tool import DragAndDropTool
from ..tools.hover_tool import HoverTool
from ..tools.press_key_tool import PressKeyTool
from ..tools.type_tool import TypeTool
from ..tools.upload_tool import UploadTool
from .base_driver import BaseDriver
from .keys import Key
from .slider import Slider
from .waiter import WAITER_SCRIPT, WAITER_SNAPSHOT_SCRIPT, wait_for_page_to_load

if TYPE_CHECKING:
    from .selenium import BiDiDriver, CdpDriver

logger = get_logger(__name__)


class SeleniumDriver(BaseDriver):
    """
    WebDriver actions shared by the browser-specific Selenium drivers, which
    differ in how they build accessibility trees and locate elements.
    """

    @staticmethod
    def of(driver: WebDriver) -> "CdpDriver | BiDiDriver":
        from .selenium import BiDiDriver, CdpDriver

        if driver.capabilities.get("browserName", "").lower() == "firefox":
            return BiDiDriver(driver)
        else:
            return CdpDriver(driver)

    def __init__(self, driver: WebDriver):
        self.driver = driver
        self.autoswitch_to_new_tab = True
        self.full_page_screenshot = FULL_PAGE_SCREENSHOT
        self.supported_tools = {
            ClickTool,
            DragAndDropTool,
            HoverTool,
            PressKeyTool,
            TypeTool,
            UploadTool,
        }
        self._init_page_scripts()

    @property
    @abstractmethod
    def platform(self) -> str:
        pass

    @abstractmethod
    def _init_page_scripts(self):
        pass

    @abstractmethod
    def find_element(self, id: int) -> WebElement:
        pass

    def _close_connections(self):
        pass

    def _with_navigation_wait(self, func: Callable):
        return func()

    @staticmethod
    def _autoswitch_to_new_tab(func: Callable) -> Callable:  # type: ignore[reportSelfClsParameterName]
        """Decorator that automatically switches to new tabs opened during method execution."""

        def wrapper(self: "SeleniumDriver", *args, **kwargs):
            if not self.autoswitch_to_new_tab:
                return self._with_navigation_wait(lambda: func(self, *args, **kwargs))

            current_handles = self.driver.window_handles
            result = self._with_navigation_wait(lambda: func(self, *args, **kwargs))
            new_handles = self.driver.window_handles
            new_tabs = [handle for handle in new_handles if handle not in current_handles]
            if new_tabs:
                # Only switch to the last new tab opened, as only one tab can be active at a time.
                # This is intentional and avoids unnecessary context switches.
                last_handle = new_tabs[-1]
                if last_handle != self.driver.current_window_handle:
                    self.driver.switch_to.window(last_handle)
                    logger.debug(f"Auto-switching to new tab: {self.driver.title} ({self.driver.current_url})")
            return result

        return wrapper

    @_autoswitch_to_new_tab
    def click(self, id: int):
        element = self.find_element(id)
        self._scroll_element_into_center(element)
        try:
            ActionChains(self.driver).move_to_element(element).click().perform()
        except (ElementNotInteractableException, MoveTargetOutOfBoundsException):
            # Fallback to direct click if ActionChains fails (e.g. for <option> elements,
            # which Firefox reports as out of bounds)
            element.click()

    def drag_slider(self, id: int, value: float):
        element = self.find_element(id)
        self._scroll_element_into_center(element)
        slider = Slider.parse(self.driver.execute_script(Slider.EXECUTE_SCRIPT, element, value))
        if slider:
            # ARIA sliders (e.g. <div role="slider">) only respond to real pointer drags.
            # Pointer offsets are relative to the element's center.
            (
                ActionChains(self.driver)
                .move_to_element_with_offset(element, *slider.start_center_offset())
                .click_and_hold()
                .move_to_element_with_offset(element, *slider.end_center_offset())
                .release()
                .perform()
            )
        else:
            self.driver.execute_script(
                "arguments[0].value = arguments[1];"
                "arguments[0].dispatchEvent(new Event('input', {bubbles: true}));"
                "arguments[0].dispatchEvent(new Event('change', {bubbles: true}));",
                element,
                str(value),
            )

    def drag_and_drop(self, from_id: int, to_id: int):
        from_element = self.find_element(from_id)
        to_element = self.find_element(to_id)
        self._scroll_element_into_center(from_element)
        actions = ActionChains(self.driver)
        actions.drag_and_drop(from_element, to_element).perform()

    def hover(self, id: int):
        element = self.find_element(id)
        self._scroll_element_into_center(element)
        actions = ActionChains(self.driver)
        actions.move_to_element(element).perform()

    @_autoswitch_to_new_tab
    def press_key(self, key: Key):
        keys = []
        if key == Key.BACKSPACE:
            keys.append(Keys.BACKSPACE)
        elif key == Key.ENTER:
            keys.append(Keys.ENTER)
        elif key == Key.ESCAPE:
            keys.append(Keys.ESCAPE)
        elif key == Key.SPACE:
            keys.append(Keys.SPACE)
        elif key == Key.TAB:
            keys.append(Keys.TAB)
        elif key == Key.ARROW_DOWN:
            keys.append(Keys.ARROW_DOWN)
        elif key == Key.ARROW_UP:
            keys.append(Keys.ARROW_UP)
        elif key == Key.ARROW_LEFT:
            keys.append(Keys.ARROW_LEFT)
        elif key == Key.ARROW_RIGHT:
            keys.append(Keys.ARROW_RIGHT)

        ActionChains(self.driver).send_keys(*keys).perform()

    def quit(self):
        self._close_connections()
        self.driver.quit()

    def back(self):
        self.driver.back()

    def visit(self, url: str):
        self.driver.get(url)

    def scroll_to(self, id: int):
        element = self.find_element(id)
        self._scroll_element_into_center(element)

    @property
    def title(self) -> str:
        return self.driver.title

    def type(self, id: int, text: str):
        element = self.find_element(id)
        self._scroll_element_into_center(element)
        element.clear()
        element.send_keys(text)

    def upload(self, id: int, paths: list[str]):
        element = self.find_element(id)
        element.send_keys("\n".join(paths))

    @property
    def url(self) -> str:
        return self.driver.current_url

    @property
    def app(self) -> str:
        return urlparse(self.driver.current_url).hostname or "unknown"

    def execute_script(self, script: str):
        self.driver.execute_script(script)

    def switch_to_next_tab(self):
        handles = self.driver.window_handles
        if len(handles) <= 1:
            return
        current_index = handles.index(self.driver.current_window_handle)
        next_index = (current_index + 1) % len(handles)
        self.driver.switch_to.window(handles[next_index])
        logger.debug(f"Switched to next tab: {self.driver.title} ({self.driver.current_url})")

    def switch_to_previous_tab(self):
        handles = self.driver.window_handles
        if len(handles) <= 1:
            return
        current_index = handles.index(self.driver.current_window_handle)
        prev_index = (current_index - 1) % len(handles)
        self.driver.switch_to.window(handles[prev_index])
        logger.debug(f"Switched to previous tab: {self.driver.title} ({self.driver.current_url})")

    def _scroll_element_into_center(self, element: WebElement):
        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)

    @retry(JavascriptException, tries=2, delay=0.1, backoff=2)  # type: ignore[reportArgumentType]
    def _wait_for_page_to_load(self):
        logger.debug("Waiting for page to finish loading:")
        loaded, pending = wait_for_page_to_load(self._waiter_snapshot)
        if not loaded:
            logger.debug(f"  <- Timed out waiting for page to load; pending requests: {pending}")
        else:
            logger.debug("  <- Page finished loading")

    def _waiter_snapshot(self) -> dict | None:
        snapshot = self.driver.execute_script(f"return {WAITER_SNAPSHOT_SCRIPT}")
        if snapshot is None:
            self.driver.execute_script(WAITER_SCRIPT)
            snapshot = self.driver.execute_script(f"return {WAITER_SNAPSHOT_SCRIPT}")
        return snapshot
