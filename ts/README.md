# Alumnium TypeScript Client

TypeScript client for Alumnium with Selenium WebDriver support.

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Test

Make sure the Alumnium server is running on `http://localhost:8013`, then:

```bash
npm test
```

## Usage

```typescript
import { Builder } from 'selenium-webdriver';
import { Alumni } from '@alumnium/ts';

const driver = await new Builder().forBrowser('chrome').build();
const al = await Alumni.create(driver, {
  url: 'http://localhost:8013',
});

await driver.get('https://example.com');
await al.do('Click the login button');
const result = await al.get('username from the page');

await al.quit();
```
