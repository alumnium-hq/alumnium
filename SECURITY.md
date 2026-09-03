# Security Policy

Alumnium is an experimental project, but we take security seriously. Thank you for helping keep Alumnium and its users safe.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, pull requests, Discord, or Slack.**

Instead, use GitHub's private vulnerability reporting: [Report a vulnerability][1]. This opens a private advisory that only the maintainers can see.

When reporting, please include as much of the following as you can:

- The affected package (`alumnium` on PyPI, `alumnium` on npm, the Java client, the server, or the MCP) and version.
- A description of the vulnerability and its potential impact.
- Steps to reproduce, or a proof of concept.
- Any suggested mitigation, if you have one.

## What to Expect

- We will acknowledge your report within 5 business days.
- We will keep you informed as we investigate and work on a fix.
- We will coordinate a disclosure timeline with you before publishing an advisory.
- We will credit you in the advisory unless you prefer to remain anonymous.

We ask that you give us reasonable time to address the issue before disclosing it publicly.

## Supported Versions

Alumnium is pre-1.0 and under active development. Security fixes are applied to the latest release only.

| Version        | Supported |
| -------------- | --------- |
| Latest release | ✅        |
| Older releases | ❌        |

## Scope

The following are generally out of scope for this policy and should be reported to the relevant upstream project instead:

- Vulnerabilities in LLM providers (Anthropic, OpenAI, Google, etc.) or their SDKs.
- Vulnerabilities in Selenium, Playwright, or Appium.
- Issues that require running Alumnium against untrusted web pages or apps with an unprotected provider API key. Alumnium sends page content to your configured LLM provider by design; keep your keys and test targets under your control.

[1]: https://github.com/alumnium-hq/alumnium/security/advisories/new
