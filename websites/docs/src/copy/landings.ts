import { langs, type I18n } from "./i18n";
import { txt, md } from "smollit";

export const ttLandings = {
  banners: {
    sota: {
      href: "/blog/webvoyager-benchmark/",

      headline: langs({
        en: "SOTA on WebVoyager 98.5%",
      }),
    },
  },

  supersections: {
    en: {
      getStarted: "Get Started",

      aiTests: "Why Alumnium?",

      helpsShip: "Why AI tests?",

      scalable: "Scale",

      comparison: "Comparison",

      needMore: "Need More?",

      faq: "FAQ",
    },
  },

  sections: {
    hero: langs({
      en: {
        headline: txt`
          <b>End-to-End Testing with AI</b>
          <br/>
          for **Agents** and **Engineers**
        `,

        subheadline: txt`
          One open-source engine underneath. The library drops into your
          existing test suite. The MCP server lets coding agents drive the same
          flows for 10× fewer tokens.
        `,

        openSource: "Open Source",

        community: "Community",

        license: "MIT License",

        ctaGetStarted: "Get Started",

        ctaDiscord: "Join Discord",
      },
    }),

    //#region Get Started

    getStarted: langs({
      en: {
        kicker: "Start",

        headline: "Get Started",

        agents: {
          headline: "For Agents",
        },

        engineers: {
          headline: "For Engineers",
        },

        subheadline: txt`
          Alumnium works for everyone: QA engineers, developers using AI agents, vibe
          coders, and everyone in between.
        `,

        // copy: txt`
        //   TODO: Alumnium is for everyone.

        //   Agents | Engineers

        //   [Learn more] | [Learn more]

        //   TODO: Block for installation and basic usage

        //   Alumnium can be used in many different scenarios, seamlessly
        //   integrating into your existing workflows.

        //   Write automated tests? Use Alumnium client to add AI automation to
        //   your existing test suite.

        //   Need a QA copilot for your coding AI agent workflow? Alumnium MCP will
        //   do all the heavy lifting without overwhelming you with context.

        //   And the best part? It's all in a slim single package!

        //   TODO: For teams
        // `,
      },
    }),

    getStartedSteps: {
      install: getStartedStep({
        heading: langs({
          en: {
            kicker: "I. Install",
          },
        }),

        agents: langs({
          en: {
            headline: "Install CLI",

            copy: md`
              Install Alumnium CLI, single cross-platform binary with a small
              footprint.
            `,
          },
        }),

        engineers: langs({
          en: {
            headline: "Install client",

            copy: md`
              Install carefully crafted, idiomatic, fully type-safe client
              package for your language of choice.
            `,
          },
        }),
      }),

      "set-up": getStartedStep({
        heading: langs({
          en: {
            kicker: "II. Set Up",
          },
        }),

        agents: langs({
          en: {
            headline: "Set Up MCP Server",

            copy: md`
              Set LLM secrets and configure Alumnium MCP to work with your
              coding agent of choice.
            `,
          },
        }),

        engineers: langs({
          en: {
            headline: "Set Up Client",

            copy: md`
              Set LLM secrets, import and configure the Alumnium client package
              in your existing test suite.
            `,
          },
        }),
      }),

      test: getStartedStep({
        heading: langs({
          en: {
            kicker: "III. Test",
          },
        }),

        agents: langs({
          en: {
            headline: "Instruct Agent to Test",

            copy: md`
              Tell your coding agent what you want to test and watch the show.
            `,
          },
        }),

        engineers: langs({
          en: {
            headline: "Write Test Steps",

            copy: md`
              Using Alumnium client write test steps for your test framework.
            `,
          },
        }),
      }),

      run: getStartedStep({
        heading: langs({
          en: {
            kicker: "IV. Run",
          },
        }),

        agents: langs({
          en: {
            headline: "Run Markdown Tests",

            copy: md`
              Ask the coding agent to save test scenario as Markdown and run it
              again using the test runner.
            `,
          },
        }),

        engineers: langs({
          en: {
            headline: "Run Test Suite",

            copy: md`
              After succeseful completion, instruct to save the LLM cache to run
              tests with minimal to zero tokens.
            `,
          },
        }),
      }),
    },

    getStartedInstall: langs({
      en: {
        kicker: "I. Install",

        headline: "Install Alumnium",

        subheadline: "Single cross-platform binary, small footprint.",
      },
    }),

    getStartedSetUp: langs({
      en: {
        kicker: "II. Set Up",

        headline: "Set Up Alumnium",

        subheadline: "TODO",
      },
    }),

    getStartedTest: langs({
      en: {
        kicker: "III. Test",

        headline: "Test Your App",

        subheadline: "TODO",
      },
    }),

    getStartedRun: langs({
      en: {
        kicker: "IV. Run",

        headline: "Run Your Tests",

        subheadline: "TODO",
      },
    }),

    //#endregion

    //#region Why

    why: langs({
      en: {
        kicker: "We stand out",

        headline: "Why Alumnium?",

        subheadline: txt`
          With market as crazy as it is, there's no shortage of AI agents
          capable of performing any task. What makes Alumnium stand out?
        `,
      },
    }),

    sota: langs({
      en: {
        kicker: "SOTA",

        headline: "State-of-the-Art",

        subheadline: "#1 on WebVoyager with 98.5% accuracy record.",

        copy: txt`
          Alumnium is the best-in-class AI browser agent, leading
          [the WebVoyager, an AI browser agent benchmark](#) with 98.5% accuracy.

          It's not just a claim — [we open-sourced our WebVoyager logs and methodology](/blog/webvoyager-benchmark/)
          for full transparency.

          It proved that our approach works in real-world scenarios, delivering
          exceptional results for fraction of the cost of other agents.
          And we're just getting started!
        `,

        leaderboardBy: "by",

        leaderboardViewAll: "View All",
      },
    }),

    efficient: langs({
      en: {
        kicker: "Efficient",

        // TODO: Efficient: tokens, low-tire, 8K vs 80K, $ vs $$
        // TODO: Long-horizon tasks: Playwright eats context, loses focus (100+)
        headline: "Efficient Through and Through",

        subheadline: txt`
          Save time and money without compromizing quality.
        `,

        stats: [
          {
            id: "bill",

            value: "1/10",

            label: "Of the main agent bill*",
          },
          {
            id: "task",

            value: "$0.15",

            label: "Price per task vs $1.34*",
          },
          {
            id: "context",

            value: "10x",

            label: "Less tokens 8K vs 79K*",
          },
        ],

        statsDisclaimer: "* vs playwright-mcp on the same task",

        // copy: txt`
        //   Alumnium designed to work with low-tier models that are faster and
        //   cheaper, ensuring efficient use of tokens without compromising output
        //   quality.

        //   When working with a coding AI agent, Alumnium MCP does all the heavy
        //   lifting, exposing just enough context to the agent to make the right
        //   decisions without causing context rot.
        // `,

        points: [
          {
            icon: "savings",

            headline: "Runs on Low-Tier Models",

            copy: txt`
              Designed to work with low-tier models that are faster and cheaper,
              Alumnium ensures efficient use of tokens without compromising
              output quality.
            `,
          },

          {
            icon: "avg_pace",

            headline: "Long-Horizon Tasks",

            copy: txt`
              It performs exceptionally well on long-horizon tasks. Where most
              AI agents struggle to complete a task, Alumnium keeps going even
              on 100+ steps.
            `,
          },

          {
            icon: "air",

            headline: "Prevents Context Rot",

            copy: txt`
              When working with a coding agent, Alumnium MCP does all the heavy
              lifting, exposing just enough context to enable the right
              decisions and keeping the context fresh.
            `,
          },
        ],
      },
    }),

    multiPlatform: langs({
      en: {
        kicker: "Web & Mobile",

        headline: "Multi-Platform: Web and Mobile",

        subheadline: txt`
          Test your web, iOS, and Android apps at the same time.
        `,

        copy: txt`
          Alumnium is multi-platform from the ground up, designed to work
          seamlessly with both web and mobile applications.

          You can use the same plain text instructions to test all supported
          platforms allowing you to ship features to your customers faster
          wherever they are.

          The multi-session feature even allows you to test multiple platforms
          simultaneously.
        `,
      },
    }),

    yourStack: langs({
      en: {
        kicker: "No Lock-in",

        headline: "Integrates With Your Stack",

        subheadline: txt`
          No lock-in, no rewrites and upfront investments.
        `,

        copy: txt`
          Plug Alumnium into the AI providers, test drivers, and languages you
          already use. No lock-in, no rewrites — swap models or frameworks any
          time without rewriting your tests.

          Run hosted models from Anthropic, OpenAI, Google, xAI, Meta,
          DeepSeek, and Mistral, or keep everything local with Ollama.

          The choice is yours: Selenium or Playwright, AWS or Azure, we don't
          lock you in.

          TODO: Add local model point.

          TODO: 4th track: assistants
        `,

        checklist: [
          {
            copy: "Supports local models via Ollama.",
          },
          {
            copy: "Native TypeScript, Python, and Java support.",
          },
        ],
      },
    }),

    // TODO: Related to integrates with your stack
    multiModel: langs({
      en: {
        kicker: "Multi-Model",

        headline: "Cloud and Local Models",

        subheadline: "Crafted and tested with multiple models.",

        copy: txt`
          TODO

          TODO
        `,
      },
    }),

    //#endregion

    //#region Helps Ship

    helpsShip: langs({
      en: {
        kicker: "Ship Faster",

        headline: "Why AI tests?",

        subheadline: txt`
          While ensuring quality, the traditional end-to-end tests also slow
          down new features and require constant adjustments to keep them
          running. AI tests improve on this.
        `,
      },
    }),

    // TODO: Langs + markdown
    naturalLanguageTests: langs({
      en: {
        kicker: "Natural",

        headline: "Use the English <strike>Programming</strike> Language",

        subheadline: "Write tests that read like a Slack message.",

        copy: txt`
          Whether you're talking to Claude Code, using Selenium integration, or
          Alumnium Test Runner, tests feel natural to write and read.

          No more brittle XPath expressions or complex waits. Just natural
          language commands that express what you want to test.

          These commands are then intelligently interpreted and executed by
          the AI, adapting to changes in the UI and reducing test maintenance.

          TODO: Intent vs implementation instructions
        `,
      },
    }),

    expressIntent: langs({
      en: {
        headline: "Express Intent, Not Implementation",

        subheadline: txt`
          Reduce test maintenance and increase reliability.
        `,

        copy: txt`
          Tired of fixing broken tests every time the UI changes? Alumnium
          adapts to changes automatically, reducing test maintenance and
          allowing you to focus on making your product better.

          Thanks to our smart element finding feature, AI cache don't drop
          every time you make changes in your app, so tests stay fast and cheap.
        `,
      },
    }),

    // TODO: Multi-later cache, self-healing, utilizes Claude Code SDK
    testRunner: langs({
      en: {
        kicker: "TODO",

        headline: "Test Runner",

        subheadline: "TODO",

        copy: txt`
          TODO

          TODO
        `,
      },
    }),

    sameTestsForAllPlatforms: langs({
      en: {
        headline: "Same Tests for All Platforms",

        subheadline: "Use the same tests across all supported platforms.",

        copy: txt`
          Building for multiple platforms is already a challenge. Maintaining
          consistent quality might feel just impossible.

          Alumnium addresses this problem by allowing you to use the same
          tests across all platforms.

          You describe your feature once, and the AI will test it across all
          platforms.
        `,
      },
    }),

    //#endregion

    //#region Scalable

    scalable: langs({
      en: {
        kicker: "Scale",

        headline: "Scale with Alumnium",

        subheadline: `
          Alumnium is build to scale with your team and business.
        `,
      },
    }),

    closeToNative: langs({
      en: {
        headline: "Close-to-Native Performance",

        subheadline: txt`
          Built to keep AI tests fast and affordable across local runs, CI, and
          teams.
        `,

        copy: txt`
          Thanks to the multi-layer caching, Alumnium avoids repeating expensive
          AI work. Once a test works, its steps and LLM responses are cached and
          reused across future runs.

          Many tests can run without making any LLM requests at all.

          TODO

          No generated tests,
          no
          // generated tests and losing the flexibility of natural language.

          With remote cache, teams can share that knowledge across environments,
          reducing cost and keeping test runs fast as the suite grows.

        `,
      },
    }),

    sharedCache: langs({
      en: {
        headline: "Shared Cache",

        subheadline: "TODO",

        copy: txt`
          TODO

          TODO
        `,
      },
    }),

    ci: langs({
      en: {
        headline: "CI",

        subheadline: "TODO",

        copy: txt`
          TODO

          TODO
        `,
      },
    }),

    telemetry: langs({
      en: {
        headline: "Telemetry",

        subheadline: "TODO",

        copy: txt`
          TODO

          TODO
        `,
      },
    }),

    //#endregion

    //#region Need More Reasons?

    needMore: langs({
      en: {
        kicker: "There's More!",

        headline: "Need More Reasons?",

        subheadline: "You're hard to impress — we like that!",
      },
    }),

    openSource: langs({
      en: {
        headline: "Open Source & Extensible",

        subheadline: "Free to use and make it your own.",

        copy: txt`
          Alumnium is fully open source under MIT license. It has an active
          community and regularly updates.

          It is easy to customize and extend to fit your specific needs.
        `,
      },
    }),

    byExperts: langs({
      en: {
        headline: "Built on Decades of Experience",

        subheadline: txt`
          Built by QA & app development experts.
        `,

        copy: txt`
          Alumnium is backed by decades of hands-on experience in QA, browser
          automation, and app development.

          From Selenium to date-fns, our team has built tools developers
          already rely on.
        `,
      },
    }),

    activeCommunity: langs({
      en: {
        headline: "Active Community",

        subheadline: txt`
          Pull requests are welcome!
        `,

        copy: txt`
          We have a strong core team, but the effort of the community is what
          makes Alumnium truly special.
        `,
      },
    }),

    supportedBy: langs({
      en: {
        headline: "In a Good Company",

        subheadline: txt`
          Supported by industry leaders.
        `,

        copy: txt`
          Alumnium is privileged to get support from these
          amazing companies.
        `,
      },
    }),

    //#endregion

    //#region Comparison

    comparison: langs({
      en: {
        kicker: "Head to head",

        headline: "Alumnium is Different",

        subheadline: txt`
          See how we line up with another browser agents.
        `,

        // copy: txt`
        //   TODO: Context isolation

        //   TODO: Doesn't need frontier models

        //   TODO: Open Telemetry

        //   TODO: Doesn't rely on vision

        //   TODO: Doesn't generate tests

        //   TODO: Multiple use cases: MCP for agents, test runner, web, mobile, etc.

        //   TODO: Not a black box

        //   TODO: Not a generic browser tool

        //   TODO: ^^^ prev 2 -> middle path, a building block

        //   TODO: No lock-in (vs Browser Use)

        //   TODO: Easy to migrate, no lock-in into model/approach (i.e. Playwright
        //   -> Alumnium -> Playwright)

        //   TODO: Runs locally

        //   TODO: Local models
        // `,
      },
    }),

    comparisonTable: {
      header: comparisonHeader({
        metric: { en: "" },
        alumnium: { en: "Alumnium" },
        "browser-use": { en: "Browser Use" },
        "playwright-mcp": { en: "playwright-mcp" },
      }),

      rows: [
        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Main agent context",
                subtext: txt`
                  Coding agent context in tokens after completing the same task.
                `,
              },
            },
          },
          alumnium: {
            kind: "string",
            value: { en: "8,000 tokens" },
            highlight: "positive",
          },
          "browser-use": {
            kind: "string",
            value: { en: "21,000 tokens" },
            highlight: "mixed",
          },
          "playwright-mcp": {
            kind: "string",
            value: { en: "79,000 tokens" },
            highlight: "negative",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Subagent context",
                subtext: txt`
                  Browser agent context after completing the same task.
                `,
              },
            },
          },
          alumnium: {
            kind: "string",
            value: { en: "400,000 tokens" },
            highlight: "positive",
          },
          "browser-use": {
            kind: "string",
            value: { en: "400,000 tokens" },
            highlight: "positive",
          },
          "playwright-mcp": { kind: "na" },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Duration",
                subtext: txt`
                  Time it takes to complete the same task.
                `,
              },
            },
          },
          alumnium: {
            kind: "string",
            value: { en: "3m 58s" },
            highlight: "positive",
          },
          "browser-use": {
            kind: "string",
            value: { en: "5m 55s" },
            highlight: "negative",
          },
          "playwright-mcp": {
            kind: "string",
            value: { en: "3m 57s" },
            highlight: "positive",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Total cost",
                subtext: txt`
                  Total cost in USD of completing the same task.
                `,
              },
            },
          },
          alumnium: {
            kind: "string",
            value: { en: "$0.15" },
            highlight: "positive",
          },
          "browser-use": {
            kind: "string",
            value: { en: "$0.39" },
            highlight: "mixed",
          },
          "playwright-mcp": {
            kind: "string",
            value: { en: "$1.34" },
            highlight: "negative",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Built-in test runner",
                subtext: txt`
                  CLI capable running Markdown tests without a coding agent.
                `,
              },
            },
          },
          alumnium: {
            kind: "support",
            support: "yes",
            superscript: "*",
          },
          "browser-use": {
            kind: "support",
            support: "no",
          },
          "playwright-mcp": {
            kind: "support",
            support: "partial",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "TypeScript client",
                subtext: txt`
                  Native JS/TS client package.
                `,
              },
            },
          },
          alumnium: {
            kind: "support",
            support: "yes",
          },
          "browser-use": {
            kind: "support",
            support: "no",
          },
          "playwright-mcp": {
            kind: "support",
            support: "yes",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Python client",
                subtext: txt`
                  Native Python client package.
                `,
              },
            },
          },
          alumnium: {
            kind: "support",
            support: "yes",
          },
          "browser-use": {
            kind: "support",
            support: "yes",
          },
          "playwright-mcp": {
            kind: "support",
            support: "no",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Java client",
                subtext: txt`
                  Native Java client package.
                `,
              },
            },
          },
          alumnium: {
            kind: "support",
            support: "yes",
          },
          "browser-use": {
            kind: "support",
            support: "no",
          },
          "playwright-mcp": {
            kind: "support",
            support: "no",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Web apps support",
                subtext: txt`
                  Testing web apps support.
                `,
              },
            },
          },
          alumnium: {
            kind: "support",
            support: "yes",
          },
          "browser-use": {
            kind: "support",
            support: "yes",
          },
          "playwright-mcp": {
            kind: "support",
            support: "yes",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Test iOS apps",
                subtext: txt`
                  Testing iOS apps support.
                `,
              },
            },
          },
          alumnium: {
            kind: "support",
            support: "yes",
          },
          "browser-use": {
            kind: "support",
            support: "no",
          },
          "playwright-mcp": {
            kind: "support",
            support: "no",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "Test Android apps",
                subtext: txt`
                  Testing Android apps support.
                `,
              },
            },
          },
          alumnium: {
            kind: "support",
            support: "yes",
          },
          "browser-use": {
            kind: "support",
            support: "no",
          },
          "playwright-mcp": {
            kind: "support",
            support: "no",
          },
        }),

        comparisonRow({
          metric: {
            kind: "metric",
            value: {
              en: {
                label: "License",
                subtext: txt`
                  Project source code license.
                `,
              },
            },
          },
          alumnium: {
            kind: "string",
            value: { en: "MIT" },
            highlight: "positive",
          },
          "browser-use": {
            kind: "string",
            value: { en: "MIT" },
            highlight: "positive",
          },
          "playwright-mcp": {
            kind: "string",
            value: { en: "Apache" },
            highlight: "positive",
          },
        }),
      ],

      disclaimer: langs({
        en: txt`
          * Alumnium test runner currently is in preview.
        `,
      }),
    },

    //#endregion

    //#region FAQ

    faq: langs({
      en: {
        kicker: "FAQ",

        headline: "Frequently Asked Questions",

        subheadline: txt`
          Still have questions? We got you covered.
        `,

        items: [
          faqItem({
            id: "what-is-alumnium",

            value: langs({
              en: {
                question: "What is Alumnium?",

                answer: md`
                  Alumnium is an AI-powered test automation framework that lets
                  you write tests using natural language commands. Instead of
                  writing complex selectors and waits, you simply describe what
                  you want to test in plain English, and Alumnium handles the
                  rest. It works with popular automation tools like Selenium,
                  Playwright, and Appium.
                `,
              },
            }),
          }),

          faqItem({
            id: "which-test-frameworks-does-alumnium-support",

            value: langs({
              en: {
                question: "Which test frameworks does Alumnium support?",

                answer: md`
                  Alumnium works with:

                  1. Selenium WebDriver for web automation.
                  2. Playwright for modern web testing.
                  3. Appium for iOS and Android mobile testing.

                  You can use Alumnium with your existing test infrastructure
                  without any major changes.
                `,
              },
            }),
          }),

          faqItem({
            id: "do-i-need-an-ai-api-key",

            value: langs({
              en: {
                question: "Do I need an AI API key?",

                answer: md`
                  Yes, Alumnium uses AI models to understand your natural
                  language commands and interact with your application. You'll
                  need an API key from supported providers like OpenAI,
                  Anthropic, or other compatible AI services. Check our
                  documentation for the full list of supported providers and
                  setup instructions.
                `,
              },
            }),
          }),

          //

          faqItem({
            id: "is-alumnium-free-to-use",

            value: langs({
              en: {
                question: "Is Alumnium free to use?",

                answer: md`
                  Yes, Alumnium is open source and free to use under the MIT
                  license. You can use it for both personal and commercial
                  projects. However, you will need to pay for AI API usage
                  separately based on your chosen AI provider's pricing.
                `,
              },
            }),
          }),

          faqItem({
            id: "how-do-i-get-started",

            value: langs({
              en: {
                question: "How do I get started?",

                answer: md`
                  Getting started is easy:

                  1. Install Alumnium via pip (Python) or npm (TypeScript).
                  2. Configure your AI provider API key.
                  3. Initialize Alumnium with your existing Selenium, Playwright, or Appium driver
                  4. Start writing tests using natural language commands.

                  Check out our [getting started guide](/docs/getting-started/installation/)
                  for detailed instructions.
                `,
              },
            }),
          }),

          faqItem({
            id: "can-i-use-alumnium-with-claude-code-codex-or-gemini",

            value: langs({
              en: {
                question:
                  "Can I use Alumnium with Claude Code, Codex, or Gemini?",

                answer: md`
                  Yes! Alumnium is available as an MCP (Model Context Protocol)
                  server that integrates seamlessly with coding agents like
                  Claude Code, Codex, and Gemini CLI. This lets you control
                  browsers and mobile apps directly from your conversations.
                `,
              },
            }),
          }),

          faqItem({
            id: "how-stable-is-alumnium",

            value: langs({
              en: {
                question: "How stable is Alumnium? Can I use it in production?",

                answer: md`
                  Alumnium is currently in early development and experimental.
                  While it's actively maintained and used by early adopters, we
                  recommend starting with non-critical test suites and gradually
                  expanding usage as you gain confidence. Join our community on
                  Discord or Slack to share feedback and stay updated on new
                  releases.
                `,
              },
            }),
          }),
        ],
      },
    }),

    //#endregion

    //#region Blog Latest

    blogLatest: langs({
      en: {
        kicker: "Blog",

        headline: "Learn More from Our Blog",
      },
    }),

    //#endregion

    //#region For Agents

    mcpWhy: langs({
      en: {
        kicker: "Why",

        headline: "Why Alumnium MCP?",

        subheadline: txt`
          Alumnium MCP is a perfect QA copilot for your coding agent of choice.
        `,
      },
    }),

    mcpMultiPlatform: langs({
      en: {
        headline: "Multi-Platform",

        subheadline: "Test multiple apps or platforms simultaneously.",

        copy: txt`
          One MCP to rule them all. Test web, Android and iOS apps at the same
          time.

          No need to write specialized step instructions for different
          platforms, just tell how it should work and let the AI figure out the
          rest.
        `,
      },
    }),

    mcpTokenEfficient: langs({
      en: {
        headline: "Token-Efficient",

        subheadline: "No MCP bloat, no context rot.",

        copy: txt`
          Alumnium MCP is designed to be token-efficient, using 10x less main
          coding agent context tokens compared to generalized MCPs like
          playwright-mcp.

          It surfaces just enough context to help your coding agent make
          decisions without causing context rot.
        `,
      },
    }),

    mcpCheapFast: langs({
      en: {
        headline: "Cheap & Fast",

        subheadline: "Designed to run by fast and low-cost models,",

        copy: txt`
          Designed to run by fast and low-cost models, Alumnium saves time and
          money while delivering reliable results.
        `,
      },
    }),

    mcpInstallCliStep: langs({
      en: {
        kicker: "I. Install",

        headline: "Install Alumnium CLI",

        subheadline: "Single cross-platform binary, small footprint.",

        copy: txt`
          The Alumnium CLI is a cross-platform single binary with a small
          footprint.

          It is open-source, built and attestated by GitHub Actions, and
          verified upon download.
        `,
      },
    }),

    mcpHow: langs({
      en: {
        kicker: "How",

        headline: "How Alumnium Works?",

        subheadline: txt`
          Follow these steps to get started with Alumnium MCP.
        `,
      },
    }),

    mcpSetupMcpStep: langs({
      en: {
        kicker: "II. Setup",

        headline: "Setup Alumnium MCP",

        subheadline: "TODO",

        copy: txt`
        `,
      },
    }),

    mcpTestAppStep: langs({
      en: {
        kicker: "III. Test",

        headline: "Test Your App",

        subheadline: txt`
          Tell your coding agent what you want to test and watch the show.
        `,

        copy: txt`
        `,
      },
    }),

    mcpRunTestsStep: langs({
      en: {
        kicker: "IV. Run",

        headline: "Run Your Tests",

        subheadline: "TODO",

        copy: txt`
        `,
      },
    }),

    mcpScaleStep: langs({
      en: {
        kicker: "V. Scale",

        headline: "Scale Your Tests",

        subheadline: "TODO",

        copy: txt`
        `,
      },
    }),

    //#endregion

    //#region For Engineers

    devClients: langs({
      en: {
        kicker: "Great DX",

        headline: "Idiomatic TypeScript & Python API",

        subheadline: "Simple, intuitive API that feels natural.",

        copy: txt`
          We carefully designed the API for each language individually, without
          cutting corners. The result is fully type-safe, well documented, and
          easy to use clients that feel natural to use.

          Whether you're a Pythonista or a JS/TS enjoyer, you'll feel right at
          home with Alumnium.

          Install a single package and you're ready to go!
        `,
      },
    }),

    //#endregion
  },
};

export namespace TtLandings {
  export interface HeadingFull {
    kicker: string;
    headline: string;
    subheadline: string;
    copy: string;
  }

  export interface GetStartedStep {
    heading: I18n.FullLangsMap<{
      kicker: string;
    }>;
    agents: I18n.FullLangsMap<Partial<HeadingFull>>;
    engineers: I18n.FullLangsMap<Partial<HeadingFull>>;
  }

  export interface ComparisonHeader {
    metric: I18n.FullLangsMap<string>;
    alumnium: I18n.FullLangsMap<string>;
    "browser-use": I18n.FullLangsMap<string>;
    "playwright-mcp": I18n.FullLangsMap<string>;
  }

  export interface ComparisonRow {
    metric: ComparisonMetricCell;
    alumnium: ComparisonCell;
    "browser-use": ComparisonCell;
    "playwright-mcp": ComparisonCell;
  }

  export interface ComparisonMetricCell {
    kind: "metric";
    value: I18n.FullLangsMap<ComparisonMetric>;
  }

  export interface ComparisonMetric {
    label: string;
    subtext: string;
  }

  export type ComparisonCell =
    | I18n.FullLangsMap<string>
    | ComparisonCellSupport
    | ComparisonCellString
    | ComparisonCellNa;

  export interface ComparisonCellSupport {
    kind: "support";
    support: "yes" | "no" | "partial";
    superscript?: string;
  }

  export interface ComparisonCellString {
    kind: "string";
    value: I18n.FullLangsMap<string>;
    highlight?: "positive" | "negative" | "mixed";
  }

  export interface ComparisonCellNa {
    kind: "na";
  }

  export interface FaqItem {
    id: string;
    value: I18n.FullLangsMap<FaqValue>;
  }

  export interface FaqValue {
    question: string;
    answer: string;
  }
}

function getStartedStep(
  step: TtLandings.GetStartedStep,
): TtLandings.GetStartedStep {
  return step;
}

function comparisonHeader(
  row: TtLandings.ComparisonHeader,
): TtLandings.ComparisonHeader {
  return row;
}

function comparisonRow(
  row: TtLandings.ComparisonRow,
): TtLandings.ComparisonRow {
  return row;
}

function faqItem(item: TtLandings.FaqItem): TtLandings.FaqItem {
  return item;
}
