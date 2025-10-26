<h1>
    <p align="center">
        <img src="https://raw.githubusercontent.com/alumnium-hq/alumnium.github.io/efb2afaf0ced7ec07c241445e7b381914281edaf/src/assets/logo.svg" height="128" alt="Logo" />
        <br />
        Alumnium
    </p>
</h1>
<p align="center">
    Pave the way towards AI-powered test automation.
    <br />
    <a href="#installation">Installation</a>
    ·
    <a href="#quick-start">Quick Start</a>
    ·
    <a href="https://alumnium.ai/docs/">Documentation</a>
</p>

Alumnium is an experimental project that builds upon the existing test automation ecosystem, offering a higher-level abstraction for testing. It simplifies interactions with applications and provide more robust mechanisms for verifying assertions. It works with Appium, Playwright, or Selenium.

https://github.com/user-attachments/assets/b1a548c0-f1e1-4ffe-bec9-d814770ba2ae

Currently in the very early stages of development and not recommended for production use.

## Installation

### Python

```bash
pip install alumnium
```

### TypeScript

```bash
npm install alumnium
```

## Quick Start

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
```

### TypeScript

1. Run Alumnium server:

```sh
docker run --rm -p 8013:8013 -e OPENAI_API_KEY=... alumnium/alumnium
```

2. Run your tests:

```javascript
import { Alumni } from "alumnium";
import { Builder } from "selenium-webdriver";

const driver = await new Builder().forBrowser("chrome").build();
const al = new Alumni(driver);

await driver.get("https://search.brave.com");
await al.do("type 'selenium' into the search field, then press 'Enter'");
await al.check("page title contains selenium");
await al.check("search results contain selenium.dev");
console.log("Atomic number:", await al.get("atomic number")); // 34

await al.quit();
```

Check out [documentation][1] and more [Python][2] and [TypeScript][6] examples!

## Contributing

See the [contributing guidelines][4] for information on how to get involved in the project and develop locally.

## Acknowledgments

[![LambdaTest](https://www.lambdatest.com/resources/images/logos/logo.svg)][5]

Alumnium is a member of [LambdaTest][5] Open Source Program, which supports the project community and development with
the necessary tools. Thank you! 💚



[1]: https://alumnium.ai/docs/
[2]: packages/python/examples/
[3]: https://alumnium.ai/docs/getting-started/configuration/
[4]: ./CONTRIBUTING.md
[5]: https://www.lambdatest.com/
[6]: packages/typescript/examples/
