# Java vs Python Package: Major Differences Analysis

## Context
The Java package (`packages/java/`) is a new client library being developed to provide Java API parity with the existing Python client (`packages/python/`). This analysis identifies all major gaps.

---

## 1. Missing CLI / Binary Management (Critical)

**Python has**: `cli.py` + dependency on `alumnium-cli` package (platform-specific wheels with pre-built binary). The `HttpClient` auto-launches a local server via `run_server()` when no `ALUMNIUM_SERVER_URL` is provided.

**Java has**: Nothing. The `HttpClient` requires an explicit `baseUrl` — there's no auto-managed server, no binary bundling, no `alumnium-cli` equivalent. Users must manually start the server and pass the URL.

---

## 2. Missing Tools (11 of 14)

Java only implements **3 tools**: `ClickTool`, `TypeTool`, `PressKeyTool`

Python implements **14 tools** — the following **11 are missing from Java**:

| Missing Tool | Description |
|---|---|
| `HoverTool` | Hover over element |
| `DragAndDropTool` | Drag element onto another |
| `DragSliderTool` | Set slider value |
| `ScrollTool` | Scroll to element |
| `UploadTool` | File upload via file chooser |
| `NavigateToUrlTool` | Navigate to URL |
| `NavigateBackTool` | Navigate back in history |
| `ExecuteJavascriptTool` | Execute JS snippet |
| `PrintToPdfTool` | Print page to PDF |
| `SwitchToNextTabTool` | Switch to next tab |
| `SwitchToPreviousTabTool` | Switch to previous tab |

Note: The Java `BaseDriver` already declares abstract methods for most of these actions (`hover`, `dragAndDrop`, `dragSlider`, `scrollTo`, `upload`, `visit`, `back`, `executeScript`, `printToPdf`, `switchToNextTab`, `switchToPreviousTab`) — only the tool wrappers are missing.

---

## 3. Missing Driver `supportedTools` Registration

Even once tools are created, driver `supportedTools` sets need updating:

| Driver | Python supported_tools | Java supportedTools |
|---|---|---|
| Selenium | Click, DragAndDrop, Hover, PressKey, Type, Upload | Click, PressKey, Type |
| Playwright | Click, DragAndDrop, Hover, PressKey, Type, Upload | Click, PressKey, Type |
| Appium | Click, DragAndDrop, PressKey, Type | Click, PressKey, Type |

---

## 4. Missing `area()` API

**Python has**: `Alumni.area(description) -> Area` method + `Area` class (`area.py`) + server endpoint `POST /v1/sessions/{id}/areas`. The `Area` class scopes `do()`, `check()`, `get()`, `find()` to a subtree of the accessibility tree via `scope_to_area()`.

**Java has**: No `area()` method, no `Area` class, no `findArea` HTTP call.

---

## 5. Missing `Cache` API

**Python has**: `Cache` class (`cache.py`) with `save()` and `discard()` methods. Exposed as `Alumni.cache` property. HTTP endpoints: `POST /v1/sessions/{id}/caches` and `DELETE /v1/sessions/{id}/caches`.

**Java has**: No cache support at all.

---

## 6. Missing Retry Logic

**Python has**: `@retry(tries=RETRIES, delay=DELAY)` decorator on `do()`, `check()`, `get()`, `find()` methods. Configurable via `ALUMNIUM_RETRIES` (default 2) and `ALUMNIUM_DELAY` (default 0.5s).

**Java has**: `Config.RETRIES` is defined but never used. No retry logic on any method.

---

## 7. Missing Playwright Async Driver

**Python has**: `PlaywrightAsyncDriver` for async Playwright usage with shared event loop. Constructor accepts `tuple[PageAsync, AbstractEventLoop]`.

**Java has**: Only sync `PlaywrightDriver`. No async variant (though Java's virtual threads may reduce this need).

---

## 8. Missing `stats` as Property vs Method

**Python**: `stats` is a `@property` (accessed as `alumni.stats`).
**Java**: `stats()` is a method (accessed as `alumni.stats()`). Minor difference, but worth noting.

---

## 9. Missing `app` Property on BaseDriver

**Python**: `BaseDriver` has `app` property (returns app name for Appium drivers, "unknown" otherwise).
**Java**: `BaseDriver` has `app()` method — this appears to be implemented.

---

## 10. Missing HTTP Client Endpoints

Java `HttpClient` is missing:
- `POST /v1/sessions/{id}/areas` (find_area) — needed for `area()`
- `POST /v1/sessions/{id}/caches` (save_cache) — needed for cache
- `DELETE /v1/sessions/{id}/caches` (discard_cache) — needed for cache

---

## 11. Missing `hover()` on BaseDriver

**Python**: Selenium and Playwright drivers have `hover(id)` in supported_tools.
**Java**: `BaseDriver` declares `hover()` but it's not in any driver's `supportedTools`.

---

## Summary: Priority-Ordered Gap List

1. **CLI/binary management + auto-server launch** — without this, users can't get started easily
2. **11 missing tools** — severely limits what actions the AI can perform
3. **Driver supportedTools registration** — even existing driver methods aren't exposed as tools
4. **`area()` API** — narrows AI context for more accurate operations
5. **Retry logic** — resilience for flaky AI/network calls
6. **Cache API** — session cache management
7. **Playwright async driver** — less critical in Java due to virtual threads
