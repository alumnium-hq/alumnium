<h1>
    <p align="center">
        <img src="https://raw.githubusercontent.com/alumnium-hq/alumnium/78721defa276aec9029f9dcf7cd8e95fd9f7f312/assets/exports/logomark.svg" height="128" alt="Logo" />
        <br />
        Alumnium
    </p>
</h1>
<p align="center">
    End-to-end testing with AI
    <br />
    <a href="#installation">Installation</a>
    ·
    <a href="#quick-start">Quick Start</a>
    ·
    <a href="https://alumnium.ai/docs/">Documentation</a>
</p>

Alumnium is an AI-native library and MCP for end-to-end testing. It builds upon the existing test automation ecosystem and simplifies interactions with applications, providing more robust mechanisms for verifying assertions. It works with Appium, Maestro, Playwright, or Selenium and gives you [state-of-the-art][7] capabilities.

https://github.com/user-attachments/assets/d191674e-4e67-41a4-b8fa-1e2f383aed77

## Installation

### MCP

```sh
curl -LsSf https://alumnium.ai/install.sh | sh
```

Then add to your agent:

```sh
claude mcp add alumnium --env OPENAI_API_KEY=... -- alumnium mcp
```

See [MCP documentation][10] for configuration, different MCP modes, and running over HTTP.

### Java

```groovy
dependencies {
  testImplementation 'ai.alumnium:alumnium:0.23.1'
  testRuntimeOnly    'ai.alumnium:alumnium-cli-darwin-arm64:0.23.1'
  // Add other platforms as needed
}
```

### Python

```bash
pip install alumnium
```

### TypeScript

```bash
npm install alumnium
```

Refer to [documentation][8] for installation details on other MCP clients.

## Quick Start

### MCP

1. Run your agent (Claude Code).
2. Tell it to open the URL and test your application.

### Java

```java
import ai.alumnium.Alumni;
import org.openqa.selenium.chrome.ChromeDriver;

class AlumniumTest {
    public static void main(String...args) {
        ChromeDriver driver = new ChromeDriver();
        Alumni al = new Alumni(driver);
        driver.get("https://search.brave.com");
        al.act("type 'selenium' into the search field, then press 'Enter'");
        al.check("page title contains selenium");
        al.check("search results contain selenium.dev");
        al.quit();
    }
}
```

### Python

```python
import os
from alumnium import Alumni
from selenium.webdriver import Chrome

os.environ["OPENAI_API_KEY"] = "..."

driver = Chrome()
driver.get("https://search.brave.com")

al = Alumni(driver)
al.do("type 'selenium' into the search field, then press 'Enter'")
al.check("page title contains selenium")
al.check("search results contain selenium.dev")
assert al.get("atomic number") == 34

al.quit()
```

### TypeScript

```ts
import { Alumni } from "alumnium";
import { Builder } from "selenium-webdriver";

process.env.OPENAI_API_KEY = "...";

const driver = await new Builder().forBrowser("chrome").build();
const al = new Alumni(driver);

await driver.get("https://search.brave.com");
await al.do("type 'selenium' into the search field, then press 'Enter'");
await al.check("page title contains selenium");
await al.check("search results contain selenium.dev");
console.assert((await al.get("atomic number")) === 34);

await al.quit();
```

Check out [documentation][1] and more [Java][9], [Python][2] and [TypeScript][6] examples.

## Contributing

See the [contributing guidelines][4] for information on how to get involved in the project and develop locally.

## Acknowledgments

[<img alt="TestMu AI" src="https://assets.testmuai.com/resources/images/testmu-ai/footer/footerLogo.svg" width="150">][5]

Alumnium is a member of the [TestMu AI][5] Open Source Program, which supports the project community and development with the necessary tools. Thank you! 💚

[1]: https://alumnium.ai/docs/
[2]: packages/python/examples/
[3]: https://alumnium.ai/docs/getting-started/configuration/
[4]: ./CONTRIBUTING.md
[5]: https://www.testmuai.com/
[6]: packages/typescript/examples/
[7]: https://alumnium.ai/blog/webvoyager-benchmark/
[8]: https://alumnium.ai/docs/guides/mcp/
[9]: packages/java/src/test/java/ai/alumnium/system
[10]: https://alumnium.ai/docs/mcp/overview/
