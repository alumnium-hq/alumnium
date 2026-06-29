import type { SectionStyle } from "#/components/landings/blocks/Section.astro";
import type { SectionContentHeadingProp } from "#/components/landings/blocks/SectionContent.astro";
import type { SectionExtraProps } from "#/components/landings/blocks/SectionExtra.astro";
import type { SectionPointsContentProps } from "#/components/landings/blocks/SectionPointsContent.astro";
import { langs, type I18n } from "./i18n";
import { txt, md } from "smollit";

const sections = {
  hero: langs({
    en: {
      headline: txt`
          End-to-End Testing with AI
          <br/>
          <small>for *Agents* and *Engineers*</small>
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

  //#region How

  how: langs({
    en: {
      kicker: "How",

      headline: "How Alumnium Works",

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

  howSteps: {
    install: howStep({
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

    "set-up": howStep({
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

    test: howStep({
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

    run: howStep({
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

  //#region AI Tests

  aiTests: langs({
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

  sameTestsForAllPlatforms: langs({
    en: {
      icon: "devices",

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

  //#region Features

  featuresBento: bento({
    cols: 6,
    style: "compact",
    heading: { h: 3 },

    items: [
      itemContent({
        span: 6,
        heading: { h: 2, style: "enlarge", align: true },
        style: "header",

        content: langs({
          en: {
            kicker: "Features",

            headline: "What's in Alumnium?",

            subheadline: txt`
                Everything you need to test your app with AI, all in one package.
              `,
          },
        }),
      }),

      itemContent({
        span: 3,
        heading: { h: 3, style: "enlarge" },

        content: langs({
          en: {
            headline: "MCP Server",

            subheadline: "Context-efficient powerup for your coding agent.",

            copy: md`
              Supercharge your coding agent with QA expertise without bloating
              your context.

              Works with any coding agent that supports stdio protocol.
            `,
          },

          extra: {
            kind: "icons",
            icons: [
              { id: "claude-code", style: "logo" },
              { id: "codex", style: "logo" },
              { id: "opencode", style: "logo" },
              { id: "antigravity", style: "logo" },
              { id: "cursor", style: "logo" },
              { id: "grok-build", style: "logo" },
              { id: "pi", style: "logo" },
            ],
          },
        }),

        extra: {
          kind: "demo",
          id: "mcp-test",
        },
      }),

      itemContent({
        span: 3,
        heading: { h: 3, style: "enlarge" },

        content: langs({
          en: {
            headline: "Client",

            subheadline: "Add AI capabilities into your existing test suite.",

            copy: md`
              Powerup your existing web, iOS, and Android test suite with QA AI.
              Works with Selenium, Playwright, and Appium.

              Crafted idiomatic, type-safe, client libraries for TypeScript,
              Python, and Java.
            `,
          },

          extra: {
            kind: "icons",
            icons: [
              { id: "typescript", style: "logo" },
              { id: "python", style: "logo" },
              { id: "java", style: "logo" },
              { id: "close_small", style: "100" },
              { id: "selenium", style: "logo" },
              { id: "playwright", style: "logo" },
              { id: "appium", style: "logo" },
            ],
          },
        }),

        extra: {
          kind: "code",
          id: "test-client",
        },
      }),

      itemContent({
        span: 2,
        heading: { h: 3 },
        style: "tight",

        content: langs({
          en: {
            headline: "Cross-Platform",

            copy: md`
Alumnium works on macOS, Windows, and Linux.
            `,
          },

          extra: {
            kind: "icons",
            icons: [
              { id: "apple", style: "brands" },
              { id: "linux", style: "brands" },
              { id: "windows", style: "brands" },
            ],
            size: "lg",
          },
        }),
      }),

      itemContent({
        span: 2,
        style: "tight",

        content: langs({
          en: {
            headline: "Small Build Size",

            copy: md`
              Alumnium CLI is a single binary with a small ~100 MB footprint.
            `,
          },

          extra: {
            kind: "icons",
            icons: [{ id: "archive", style: "100" }],
            size: "lg",
          },
        }),
      }),

      itemContent({
        span: 2,
        style: "tight",

        content: langs({
          en: {
            headline: "JSON API",

            copy: md`
              Get full control over Alumnium with detailed
              JSON API.
            `,
          },

          extra: {
            kind: "icons",
            icons: [{ id: "api", style: "100" }],
            size: "lg",
          },
        }),
      }),

      itemContent({
        span: 6,
        cols: 2,
        heading: { h: 3, style: "enlarge" },
        style: "header",
        adjust: true,
        continue: true,

        content: langs({
          en: {
            headline: "Agentic Toolbox",

            subheadline: "Rich AI-powered QA toolbox.",
          },

          extra: {
            kind: "icons",
            icons: [
              { id: "handyman", style: "100" },
              { id: "service_toolbox", style: "100" },
              { id: "tools_power_drill", style: "100" },
            ],
          },
        }),

        extra: {
          kind: "copy",
          content: langs({
            en: md`
              Whether you use MCP or integrate Alumnium client into your
              existing test suite, you get a rich set of tools that speed up
              testing and test suite maintenance.

              These tools are optimized for long-horizon tasks and context
              efficiency.
            `,
          }),
        },
      }),

      itemContent({
        span: 6,
        heading: { h: 3, style: "enlarge" },

        content: {
          kind: "points",
          heading: { h: 3 },
          cols: 4,

          items: [
            {
              icon: "scan",
              content: langs({
                en: {
                  headline: "Change Analyzer",
                  copy: md`
                    Analyzes UI changes and provides tree diff to
                    analyze how it affects the task.
                  `,
                },
              }),
            },

            {
              icon: "scan",
              content: langs({
                en: {
                  headline: "Check Tool",
                  copy: md`
                    Checks if the app is in the expected state, and reports any discrepancies.
                  `,
                },
              }),
            },

            {
              icon: "database_search",
              content: langs({
                en: {
                  headline: "Data Retriever",
                  copy: md`
                    Retrieves specific data or state from the app for
                    validation or further processing.
                  `,
                },
              }),
            },

            {
              icon: "visibility",
              content: langs({
                en: {
                  headline: "Vision",
                  copy: md`
                    Uses computer vision to analyze screenshots for more challenging tasks.
                  `,
                },
              }),
            },

            {
              icon: "scan",
              content: langs({
                en: {
                  headline: "Do Tool",
                  copy: md`
                    Figures out how to perform a task and executes it, without
                    explicit instructions.
                  `,
                },
              }),
            },

            {
              icon: "checklist",
              content: langs({
                en: {
                  headline: "Planner",
                  copy: md`
                    Splits a complex task into smaller steps, tracks and
                    executes them in order.
                  `,
                },
              }),
            },

            {
              icon: "find_in_page",
              content: langs({
                en: {
                  headline: "Element Finder",
                  copy: md`
                    Finds elements on the page using natural language
                    descriptions, even if they change over time.
                  `,
                },
              }),
            },

            {
              icon: "center_focus_strong",
              content: langs({
                en: {
                  headline: "Area Focus",
                  copy: md`
                    Focuses on a specific area of the page for more precise
                    interactions.
                  `,
                },
              }),
            },
          ],
        },
      }),

      itemContent({
        span: 3,
        heading: { h: 3, style: "enlarge" },

        content: langs({
          en: {
            headline: "Deep Browser Integration",

            subheadline: "Can handle most complex web apps.",

            copy: md`
              Alumnium supports virtually all of the browser APIs, including
              frames, shadow DOM, file uploads, tabs, and more.

              It comes with smart waiting and element finding features that
              work consistently across all supported automation frameworks.
            `,
          },
        }),

        extra: {
          kind: "checklist",
          items: [
            langs({ en: "Tabs handling" }),

            langs({ en: "Auto wait & retry" }),

            langs({ en: "Persistent profiles" }),

            langs({ en: "Frames" }),

            langs({ en: "Page screenshot" }),

            langs({ en: "File uploads" }),

            langs({ en: "PDF export" }),

            langs({ en: "Custom JavaScript" }),

            langs({ en: "Exotic controls" }),
          ],
        },
      }),

      itemContent({
        span: 3,
        heading: { h: 3, style: "enlarge" },

        content: langs({
          en: {
            headline: "UI Tree",

            subheadline: "Can handle most complex web apps.",

            copy: md`
              Unlike many other AI agents that rely on screenshots, Alumnium
              uses text-based UI representation to understand the app's
              structure and state,

              Based on the accessibility trees provided by platforms, Alumnium
              builds focused XML representation, leveraging LLMs strongest suit:
              understanding and reasoning about complex structures.
            `,
          },
        }),

        extra: {
          kind: "icons",
          size: "lg",
          icons: [
            { id: "text_compare", style: "100" },
            { id: "visibility_lock", style: "100" },
          ],
        },
      }),

      itemContent({
        span: 6,
        cols: 2,
        heading: { h: 3, style: "enlarge" },
        style: "compact",

        content: langs({
          en: {
            headline: "Multi-Level Cache",

            subheadline: "Smart caching for faster and cheaper tests.",

            copy: md`
              Alumnium's multi-level caching system optimized to reduce
              the number of LLM requests to the minimum.

              The smart caching allows to sustain significant UI changes,
              abstracting away the dynamic parts of the app.
            `,
          },
        }),

        extra: {
          kind: "points",
          heading: { h: 3 },

          items: [
            {
              icon: "network_intelligence_update",

              content: langs({
                en: {
                  headline: "Native Cache",

                  copy: txt`
                      Prompts optimized to reduce requests cost by leveraging
                      native LLM cache.
                    `,
                },
              }),
            },

            {
              icon: "archive",

              content: langs({
                en: {
                  headline: "Requests Cache",

                  copy: txt`
                      LLM responses are cached and reused to avoid repeating
                      the same requests.
                    `,
                },
              }),
            },

            {
              icon: "list_alt_check",

              content: langs({
                en: {
                  headline: "Test Steps Cache",

                  copy: txt`
                      Steps generated from plain language instructions
                      get cached and reused.
                    `,
                },
              }),
            },
          ],
        },
      }),

      itemContent({
        span: 2,
        style: "tight",

        content: langs({
          en: {
            headline: "Multi-Model",

            subheadline: "Pick and choose models.",

            copy: md`
              Use models that works best for you, choosing from a wide range
              of options available. Each model tested and optimized for best
              performance.
            `,
          },

          extra: {
            kind: "icons",
            icons: [
              { id: "openai", style: "logo" },
              { id: "claude", style: "logo" },
              { id: "gemini", style: "logo" },
              { id: "grok", style: "logo" },
              { id: "deepseek", style: "logo" },
              { id: "mistral", style: "logo" },
              { id: "meta", style: "logo" },
            ],
          },
        }),
      }),

      itemContent({
        span: 2,
        style: "tight",

        content: langs({
          en: {
            headline: "Multi-Cloud",

            subheadline: "Supports multiple cloud providers.",

            copy: md`
              Utilize any model provider you already use: AWS, Azure, Google Cloud, or
              directly from the model developer.
            `,
          },

          extra: {
            kind: "icons",
            icons: [
              { id: "aws", style: "brands" },
              { id: "azure", style: "dev" },
              { id: "googlecloud", style: "dev" },
            ],
          },
        }),
      }),

      itemContent({
        span: 2,
        style: "tight",

        content: langs({
          en: {
            headline: "Local Models Support",

            subheadline: "Run on local infrastructure.",

            copy: md`
              Prevent any data from leaving your network and save money on
              tokens by running open-weight models on your own infrastructure
              with Ollama.
            `,
          },

          extra: {
            kind: "icons",

            icons: [{ id: "ollama", style: "logo" }],
          },
        }),
      }),

      itemContent({
        span: 6,
        cols: 2,
        heading: { h: 3, style: "enlarge" },
        style: "default",
        continue: true,

        content: langs({
          en: {
            kicker: "Runner",

            headline: "Markdown Tests Runner<sup>*</sup>",

            subheadline:
              "Run Markdown tests without a coding agent on CI or locally.",

            copy: md`
              Alumnium ships with a test runner that seamlessly integrates with your
              coding AI agent workflow:

              1. Test your app using coding agent with Alumnium MCP.
              2. Ask it to save test description as a Markdown file.
              3. Run the test \`alumnium test <filename>.md\`.

              <footer>* Alumnium test runner currently is in preview</footer>
            `,
          },
        }),

        extra: {
          kind: "demo",
          id: "test-runner",
        },
      }),

      itemContent({
        span: 6,
        style: "compact",

        content: {
          kind: "points",

          items: [
            {
              icon: "replay",

              content: langs({
                en: {
                  headline: "Record and Replay",

                  copy: txt`
                      All tool calls get recorded and replayed. Combined with LLM cache,
                      it allows to run tests without spending any tokens at all.
                    `,
                },
              }),
            },

            {
              icon: "healing",

              content: langs({
                en: {
                  headline: "Self-Healing",

                  copy: txt`
                    When UI changes, the test runner automatically adapts notifying
                    you only when there's an actual bug.
                  `,
                },
              }),
            },

            {
              icon: "devices",

              content: langs({
                en: {
                  headline: "Cross-Platform Tests",

                  copy: txt`
                    Use same Markdown tests to test your web, iOS, and Android apps
                    at the same time.
                  `,
                },
              }),
            },

            {
              icon: "robot_2",

              content: langs({
                en: {
                  headline: "Agent SDK-Powered",

                  copy: txt`
                      The test runner utilizes native agent SDKs that allows to match
                      your agent's configuration and behavior.
                    `,
                },
              }),
            },
          ],
        },
      }),
    ],
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
          Designed to make AI tests fast and affordable on scale.
        `,

      copy: txt`
          Thanks to the multi-level caching, Alumnium avoids repeating expensive
          AI work. Once a test works, its steps and LLM responses are cached and
          reused across future runs.

          Many tests can run without making any LLM requests at all.
        `,
    },
  }),

  sharedCache: langs({
    en: {
      headline: "Remote Cache<sup>*</sup>",

      subheadline: "Avoid skyrocketing costs when your team grows.",

      copy: txt`
          With remote cache teams can share all of the multi-level cache layers,
          allowing to leverage the work that other team members have already
          done.

          <footer>* Remote cache currently is in preview</footer>
        `,
    },
  }),

  ci: langs({
    en: {
      headline: "Continuous Integration",

      subheadline: "CI is not an afterthought, it's a first-class citizen.",

      copy: txt`
          Alumnium is designed to work seamlessly with your CI/CD pipelines. It
          can be easily integrated into your existing workflows, leveraging
          the same remote cache.

          With security concerns in mind, Alumnium can be configured to run tests
          without making any LLM requests at all, or leveraging models
          provided in your CI environment.
        `,
    },
  }),

  telemetry: langs({
    en: {
      headline: "Telemetry",

      subheadline: "Get insights into your tests and agents.",

      copy: txt`
          All of the Alumnium tools instrumented with OpenTelemetry, allowing
          you to collect and analyze telemetry data from your tests and agents.

          This data can be used to identify performance bottlenecks, track
          errors, and improve the overall quality of your tests.
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
};

export const ttLandings = {
  banners: {
    sota: {
      href: "/blog/webvoyager-benchmark/",

      headline: langs({
        en: "SOTA on WebVoyager 98.5%",
      }),
    },
  },

  supersections: langs({
    en: {
      how: "How",

      why: "Why",

      aiTests: "AI Tests",

      features: "Features",

      scale: "Scale",

      comparison: "Comparison",

      needMore: "Need More?",

      faq: "FAQ",
    },
  }),

  sections,
};

export namespace TtLandings {
  export interface ContentFull {
    kicker: string;
    headline: string;
    subheadline: string;
    copy: string;
  }

  export type Content = Partial<ContentFull>;

  export interface HowStep {
    heading: I18n.FullLangsMap<{
      kicker: string;
    }>;
    agents: I18n.FullLangsMap<Content>;
    engineers: I18n.FullLangsMap<Content>;
  }

  export interface Bento {
    cols: 1 | 2 | 3 | 4 | 5 | 6;
    heading: SectionContentHeadingProp;
    style?: SectionStyle;
    items: BentoItem[];
  }

  export interface BentoItem {
    kind: "content";
    heading?: SectionContentHeadingProp;
    content: BentoItemContent;
    extra?: SectionExtraProps;
    span?: 1 | 2 | 3 | 4 | 5 | 6;
    style?: SectionStyle;
    adjust?: boolean;
    cols?: 1 | 2;
    continue?: boolean;
  }

  export type BentoItemContent = BentoItemContentCopy | BentoItemContentPoints;

  export type BentoItemContentCopy = I18n.FullLangsMap<Content> & {
    extra?: SectionExtraProps;
  };

  export interface BentoItemContentPoints extends SectionPointsContentProps {
    kind: "points";
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

function howStep(step: TtLandings.HowStep): TtLandings.HowStep {
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

function bento(value: TtLandings.Bento): TtLandings.Bento {
  return value;
}

function itemContent(
  item: Omit<TtLandings.BentoItem, "kind">,
): TtLandings.BentoItem {
  return { kind: "content", ...item };
}
