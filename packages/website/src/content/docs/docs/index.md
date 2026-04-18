---
title: Alumnium
description: Alumnium enhances test automation with AI, simplifying browser interactions, reducing test updates, and integrating seamlessly with existing frameworks.
---

![An illustration of Alumnium robot](../../../assets/index.webp)

Alumnium is an experimental project that builds upon the existing test automation ecosystem, offering a higher-level abstraction for testing. It aims to simplify interactions with mobile and web applications and provide more robust mechanisms for verifying assertions.

Imagine a future where AI powers test automation. We're not quite there yet, but Alumnium paves the way towards this future!

## Motivation

Over the years of working on test automation, we've all dreamt of tests that aren't flaky, can adapt to application changes, and generally behave as a human tester would. Dozens of products claim to have solved these problems. Yet, the issues remain, and thousands of QA engineers worldwide solve them daily.

What if AI could help us solve them? Many people have likely had this thought, and plenty of different projects have emerged, building products that promise AI-powered test automation with low maintenance effort. These products often neglect the current state of software testing and discard the existing ecosystem of test runners, browser and mobile automation tools, and the community of QA engineers helping each other thrive.

Alumnium was created out of frustration that no open-source project builds upon the existing test automation ecosystem. It aims to provide a gradual migration path to using AI in real projects, where dozens of end-to-end tests might already be written, running, and reporting on CI. Alumnium doesn't force any changes to the existing setup; it simply allows you to replace some parts of the tests with the help of AI, reducing the code needed to write and maintain these tests.

## Design

Alumnium wraps an Appium, Playwright, or Selenium instance and provides a high-level API to perform actions, assert verifications based on the application's state and retrieve information from it. It works by operating on the accessibility tree, compacting it, and sending it to the AI model along with instructions about what has to be done or checked. Once the AI model determines the course of action, Alumnium instructs the browser what to do on the page.

This means that Alumnium can co-exist with existing Appium/Selenium/Playwright tests and CI. The only thing it needs is access to an AI model.
