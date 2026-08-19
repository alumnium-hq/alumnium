import type { IconProp } from "../components/Icon.types";
import type {
  SectionContentHeadingProp,
  SectionExtraProps,
  SectionPointsContentProps,
  SectionStyle,
} from "#/components/landings/blocks/Section.types";
import { langs, type I18n } from "./i18n";
import { txt, md } from "smollit";

const iconsDel: IconProp = { id: "close_small", style: "100" };

const agentIcons: IconProp[] = [
  { id: "claude-code", style: "logo" },
  { id: "codex", style: "logo" },
  { id: "opencode", style: "logo" },
  { id: "antigravity", style: "logo" },
  { id: "cursor", style: "logo" },
  { id: "grok-build", style: "logo" },
  { id: "pi", style: "logo" },
];

const langIcons: IconProp[] = [
  { id: "typescript", style: "logo" },
  { id: "python", style: "logo" },
  { id: "java", style: "logo" },
];

const frameworkIcons: IconProp[] = [
  { id: "selenium", style: "logo" },
  { id: "playwright", style: "logo" },
  { id: "appium", style: "logo" },
  { id: "webdriverio", style: "logo" },
];

const sections = {
  hero: langs({
    en: {
      headline: txt`
        End-to-End Testing with AI
        <br/>
        <small>for *Agents* and *Engineers*</small>
      `,

      subheadline: txt`
        State-of-the-art MCP server, libraries,
        and a test runner for web and mobile
        applications testing.
      `,

      extra: {
        kind: "icons",
        size: "xs",
        icons: [
          ...langIcons,
          { id: "http", style: "200" },
          iconsDel,
          ...frameworkIcons,
          iconsDel,
          ...agentIcons.slice(0, 4),
          { id: "more_horiz", style: "200" },
        ],
        align: true,
      } satisfies SectionExtraProps,

      watchDemo: "Watch Demo",

      openSource: "Open Source",

      community: "Community",

      license: "MIT License",

      ctaGetStarted: "Start Testing",

      ctaDiscord: "Join Discord",
    },
  }),

  //#region How

  how: langs({
    en: {
      kicker: "How",

      headline: "How Alumnium Works",

      agents: {
        headline: "Agents",
      },

      engineers: {
        headline: "Engineers",
      },

      subheadline: txt`
        Connect Alumnium to a coding agent through MCP, or add its Java, Python,
        or TypeScript client to the automated tests you already have.
      `,
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
          headline: "Add an MCP Server",

          copy: md`
            Install Alumnium binary using a installation script or a package manager.
          `,
        },
      }),

      engineers: langs({
        en: {
          headline: "Install a Client Library",

          copy: md`
            Install the Alumnium client for Java, Python, or TypeScript.
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
          headline: "Set Up the MCP Server",

          copy: md`
            Choose a supported AI provider, configure its credentials when
            required, and connect Alumnium to your MCP-compatible coding agent.
          `,
        },
      }),

      engineers: langs({
        en: {
          headline: "Set Up the Client Library",

          copy: md`
            Choose a supported AI provider, then initialize Alumnium with your
            existing Selenium, Playwright, or Appium driver.
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
          headline: "Prompt to Test",

          copy: md`
            Describe the user flow and expected result in plain language. Your
            coding agent uses Alumnium to drive and verify the application.
          `,
        },
      }),

      engineers: langs({
        en: {
          headline: "Write Test Steps",

          copy: md`
            Add natural-language actions, checks, and data retrievals alongside
            the framework code already in your tests.
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
            Ask your coding agent to save a successful scenario as Markdown.
            Run it again locally or in CI with Alumnium test runner.
          `,
        },
      }),

      engineers: langs({
        en: {
          headline: "Run Test Suite",

          copy: md`
            Run your test suite as usual, with Alumnium handling natural-language steps and checks.
          `,
        },
      }),
    }),
  },

  //#endregion

  //#region Why

  why: langs({
    en: {
      kicker: "Why",

      headline: "Why Alumnium",

      subheadline: txt`
        Alumnium combines high-level AI tools with the automation frameworks you
        already use, so you can adopt AI without replacing your test stack.
      `,
    },
  }),

  sota: langs({
    en: {
      kicker: "Benchmark",

      headline: "State-of-the-Art Performance",

      subheadline:
        "Claude Code with Alumnium MCP achieved a 98.5% pass rate across 610 tasks.",

      copy: txt`
        Claude Code with Alumnium MCP successfully completed 98.5% out of 610 tasks in the
        WebVoyager browser-agent benchmark. The result shows how high-level Alumnium tools can keep a general-purpose agent focused while Alumnium handles browser interaction details.

        [Read more about the WebVoyager benchmark results](/blog/webvoyager-benchmark/).
      `,

      leaderboardBy: "by",

      leaderboardViewAll: "View All",
    },
  }),

  efficient: langs({
    en: {
      kicker: "Efficient",

      headline: "Free Up Your Agent's Context",

      subheadline: txt`
        Keep browser/mobile details out of the agent's context and reuse AI work
        across repeated test runs.
      `,

      stats: [
        {
          id: "context",
          value: "5×",
          label: "Fewer tokens: 45K vs. 240K",
        },
        {
          id: "bill",
          value: "1/4",
          label: "of Playwright's cost",
        },
      ],

      statsDisclaimer: "",

      points: [
        {
          icon: "savings",

          headline: "Works with Smaller Models",

          copy: txt`
            Alumnium is designed for smaller, lower-cost models. Choose from the
            supported models based on the speed, cost, and capability your tests
            require.
          `,
        },

        {
          icon: "avg_pace",

          headline: "Long-Horizon Tasks",

          copy: txt`
            High-level tools keep low-level interactions inside Alumnium, helping
            the coding agent stay focused through workflows with many steps.
          `,
        },

        {
          icon: "air",

          headline: "Reduces Context Growth",

          copy: txt`
            Alumnium MCP performs the detailed UI work and returns concise change
            summaries, so the coding agent receives only the context it needs to proceed.
          `,
        },
      ],
    },
  }),

  multiPlatform: langs({
    en: {
      kicker: "Web & Mobile",

      headline: "Web, iOS and Android",

      subheadline: txt`
        Apply the same high-level test intent to web, iOS, and Android apps.
      `,

      copy: txt`
        Alumnium works with web applications through Selenium or Playwright and
        with iOS and Android applications through Appium.

        Reuse plain-language instructions across supported platforms, with
        platform-specific adjustments when the applications behave differently.

        Multi-session support lets you run configured platform sessions at the
        same time.
      `,
    },
  }),

  yourStack: langs({
    en: {
      kicker: "Fits Your Stack",

      headline: "Meets You Where You Are",

      subheadline: txt`
        Adopt Alumnium incrementally without replacing your test framework.
      `,

      copy: txt`
        Add Alumnium to the supported AI providers, automation frameworks, and
        languages you already use. Client libraries let you introduce AI one
        step at a time alongside existing framework code.

        Choose from supported hosted models from Anthropic, OpenAI, Google, xAI,
        Meta, DeepSeek, and Mistral, or run a supported local model with Ollama.

        Change supported models without changing the test intent, and keep using
        Selenium, Playwright, or Appium as the underlying automation layer.
      `,
    },
  }),

  //#endregion

  //#region AI Tests

  aiTests: langs({
    en: {
      kicker: "Ship Faster",

      headline: "Why AI Tests",

      subheadline: txt`
        Traditional end-to-end tests often require selectors, waits, and ongoing
        maintenance as the UI changes. Alumnium lets tests express more of their
        intent in natural language while retaining framework-level control.
      `,
    },
  }),

  naturalLanguageTests: langs({
    en: {
      kicker: "Natural",

      headline: "Use English <strike>Programming Language</strike>",

      subheadline:
        "Describe actions and expected outcomes in readable language.",

      copy: txt`
        Whether you use a coding agent through MCP, a client library in an
        existing suite, or the test runner, the same natural-language
        commands describe what the application should do.

        Use natural-language actions and checks where you would otherwise need
        detailed selectors and explicit waits, while retaining direct access to
        the underlying framework when you need it.

        Alumnium interprets these commands against the current UI, which makes
        tests more resilient to changes in element identifiers and structure.
      `,

      tabs: {
        md: "Markdown",
        ts: "TypeScript",
        python: "Python",
        java: "Java",
      },
    },
  }),

  expressIntent: langs({
    en: {
      headline: "Express Intent, Not Implementation",

      subheadline: txt`
        Keep implementation details out of the test.
      `,

      copy: txt`
        Alumnium resolves natural-language descriptions against the current UI,
        reducing the number of selectors tied to a specific implementation.

        Its element cache can match previously selected elements after minor UI
        changes, reducing repeated LLM work. Larger changes can still require a
        new model request or an update to the test.
      `,
    },
  }),

  sameTestsForAllPlatforms: langs({
    en: {
      icon: "devices",

      headline: "Reuse Tests Across Platforms",

      subheadline:
        "Describe equivalent web and mobile flows in the same language.",

      copy: txt`
        Web and mobile applications often implement the same user journey with
        different controls and layouts.

        Alumnium lets you reuse high-level instructions across web, iOS, and
        Android while configuring an appropriate driver for each platform.

        Platform-specific behavior may still need separate instructions, but the
        shared intent remains readable and consistent.
      `,
    },
  }),

  //#endregion

  //#region Features

  features: bento({
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

            headline: "What's in Alumnium",

            subheadline: txt`
              Three entry points for agents, existing testing suites and
              brand new Markdown testing workflows.
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

            subheadline: "High-level testing tools for agents.",

            copy: md`
              Let coding agents drive and verify web or mobile applications
              without filling their context with low-level UI details.

              Connect an MCP-compatible coding agent, or build your own agent on
              top of Alumnium's MCP tools. The server uses local stdio transport.
            `,
          },

          extra: {
            kind: "icons",
            icons: agentIcons,
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
            headline: "Client Libraries",

            subheadline: "Add AI gradually to an existing test suite.",

            copy: md`
              Mix Alumnium's natural-language actions and checks with existing
              Selenium, Playwright, and Appium code.

              Client libraries are available for Java, Python, and TypeScript,
              so you can adopt AI one test step at a time.
            `,
          },

          extra: {
            kind: "icons",
            icons: [...langIcons, iconsDel, ...frameworkIcons],
          },
        }),

        extra: {
          kind: "code",
          id: "test-client",
        },
      }),

      itemContent({
        span: 2,
        style: "tight",

        content: langs({
          en: {
            headline: "Single Binary",

            copy: md`
              Alumnium is distributed as a single binary with an approximately
              100 MB footprint.
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
        heading: { h: 3 },
        style: "tight",

        content: langs({
          en: {
            headline: "Major Operating Systems",

            copy: "Alumnium works on macOS, Windows, and Linux.",
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
            headline: "HTTP API",

            copy: md`
              Alumnium Server allows controlling programmatically using HTTP API.
            `,
          },

          extra: {
            kind: "icons",
            icons: [{ id: "api", style: "200" }],
            size: "lg",
          },
        }),
      }),

      itemContent({
        span: 6,
        cols: 2,
        heading: { h: 3, style: "enlarge" },
        style: "compact",
        adjust: true,
        continue: true,

        content: langs({
          en: {
            headline: "Agentic Toolbox",

            subheadline: "High-level tools for common testing tasks.",
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
              Whether you use MCP or integrate the Alumnium client into your
              existing test suite, the same tools can act, verify state, retrieve
              data, and resolve elements from natural-language instructions.

              They keep detailed UI work inside Alumnium, reducing the amount of
              context exposed to a calling agent.
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
              icon: "trackpad_input",
              content: langs({
                en: {
                  headline: "Do Tool",
                  copy: md`
                    Plans actions and executes them in the app based on the natural language goal.
                  `,
                },
              }),
            },

            {
              icon: "check_circle",
              content: langs({
                en: {
                  headline: "Check Tool",
                  copy: md`
                    Checks whether the app is in the expected state and explains
                    the result.
                  `,
                },
              }),
            },

            {
              icon: "database_search",
              content: langs({
                en: {
                  headline: "Get Tool",
                  copy: md`
                    Retrieves requested data or state from the application for
                    validation or further processing.
                  `,
                },
              }),
            },

            {
              icon: "timer",
              content: langs({
                en: {
                  headline: "Wait Tool",
                  copy: md`
                    Waits until the app reaches a desired condition
                    expressed with natural language.
                  `,
                },
              }),
            },

            {
              icon: "difference",
              content: langs({
                en: {
                  headline: "Change Analyzer",
                  copy: md`
                    Summarizes UI changes after an action so an agent receives feedback just in time.
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
                    Uses screenshots when visual information is needed to complete
                    a check or retrieval.
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
                    Finds elements from the natural language descriptions
                    for use in automation frameworks.
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

            subheadline: "Support for advanced browser workflows.",

            copy: md`
              Alumnium supports browser workflows such as tabs navigation,
              pages with frames, shadow DOM, file uploads, persistent profiles,
              and others.

              Exact capabilities vary by automation framework and platform - see
              the documentation for the current support matrix.
            `,
          },
        }),

        extra: {
          kind: "checklist",
          items: [
            langs({ en: "Tab handling" }),

            langs({ en: "Automatic waits & retries" }),

            langs({ en: "Persistent profiles" }),

            langs({ en: "Frames support" }),

            langs({ en: "Shadow DOM" }),

            langs({ en: "Screenshots and videos" }),

            langs({ en: "File uploads" }),

            langs({ en: "PDF export" }),

            langs({ en: "Execute JavaScript" }),

            langs({ en: "History navigation" }),

            langs({ en: "Sliders manipulation" }),

            langs({ en: "Headless browsers" }),

            langs({ en: "Cookies assignment" }),

            langs({ en: "Browser permissions" }),

            langs({ en: "Proxy support" }),

            langs({ en: "Playwright traces" }),

            langs({ en: "Custom HTTP headers" }),

            langs({ en: "Custom User-Agent" }),
          ],
        },
      }),

      itemContent({
        span: 3,
        heading: { h: 3, style: "enlarge" },

        content: langs({
          en: {
            headline: "UI Tree",

            subheadline:
              "Structured UI context instead of screenshot-only control.",

            copy: md`
              Alumnium primarily uses a text-based representation to understand
              the application's structure and state, adding vision when a task
              requires visual information.

              It turns platform accessibility trees into focused XML, giving the
              model structured context about relevant controls and content.
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

            subheadline: "Reuse model responses and element decisions.",

            copy: md`
              Alumnium caches model responses and element decisions to reduce
              repeated LLM requests on subsequent test runs.

              The element cache can remain useful when dynamic identifiers or
              minor UI details change. Broader changes can trigger a new request.
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
                  headline: "Prompt Cache",

                  copy: txt`
                    Alumnium prompts are structured in a way that
                    takes advantage of provider-side caching.
                  `,
                },
              }),
            },

            {
              icon: "archive",

              content: langs({
                en: {
                  headline: "Response Cache",

                  copy: txt`
                    Model responses are stored and reused when the request context
                    has not changed.
                  `,
                },
              }),
            },

            {
              icon: "list_alt_check",

              content: langs({
                en: {
                  headline: "Element Cache",

                  copy: txt`
                    Element decisions are matched against the current UI so
                    changes do not always require another model request.
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

            subheadline: "Choose a supported model for your workload.",

            copy: md`
              Select from the supported provider and model matrix based on the
              capability, latency, cost, and deployment model your tests need.
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

            subheadline: "Use supported hosted model providers.",

            copy: md`
              Connect through supported cloud platforms or directly to a model
              provider.
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
            headline: "Local Models",

            subheadline: "Keep model inference on your infrastructure.",

            copy: md`
              Run a supported open-weight model through Ollama when application
              data must stay within infrastructure you control.
            `,
          },

          extra: {
            kind: "icons",

            icons: [
              { id: "ollama", style: "logo" },
              { id: "mistral", style: "logo" },
              { id: "qwen", style: "logo" },
            ],
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

            headline: "Markdown Test Runner<sup>*</sup>",

            subheadline:
              "Run agent-written or manually written Markdown tests locally or in CI.",

            copy: md`
              Alumnium includes a preview test runner for repeatable execution of
              Markdown scenarios:

              1. Write a Markdown scenario manually, or create one with a coding
                 agent and Alumnium MCP.
              2. Review and save the scenario in your repository.
              3. Run the test \`alumnium test <filename>.md\`.

              <footer>* The test runner is currently in preview.</footer>
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
          heading: { h: 3 },

          items: [
            {
              icon: "replay",

              content: langs({
                en: {
                  headline: "Record and Replay",

                  copy: txt`
                    The runner records tool calls for reuse. With a warm cache and
                    an unchanged flow, a replay may need no new LLM requests.
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
                    When cached steps no longer match the UI, Alumnium can resolve
                    them again before reporting a failure.
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
                    Reuse high-level Markdown scenarios across configured web,
                    iOS, and Android sessions.
                  `,
                },
              }),
            },

            {
              icon: "robot_2",

              content: langs({
                en: {
                  headline: "Agent SDKs",

                  copy: txt`
                    Native agent SDKs let the runner use a compatible agent
                    configuration during local and CI execution. Claude Agent SDK
                    is currently supported.
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
        Alumnium has all you need from running few tests to thousands.
      `,
    },
  }),

  server: langs({
    en: {
      headline: "Central Server",

      subheadline:
        "Manage model requests and caching for multiple agents and test runners.",

      copy: txt`
        Alumnium Server is a single binary that runs on your infrastructure and
        handles model requests, caching, and test execution for multiple agents
        and test runners.
      `,
    },
  }),

  sharedCache: langs({
    en: {
      headline: "Local and Remote Cache",

      subheadline: "Designed to make AI tests fast and affordable on a scale.",

      copy: txt`
        Alumnium cache can be stored locally on the filesystem or remotely<sup>*</sup>
        so team members and CI jobs don't need to repeat the same model requests
        independently.

        <footer>* Remote cache is currently in preview.</footer>
      `,
    },
  }),

  ci: langs({
    en: {
      headline: "CI/CD",

      subheadline: "Run the same test workflows locally and in CI.",

      copy: txt`
        Run tests using client libraries or Markdown scenarios in your existing CI/CD
        workflows. Restore a cache between jobs, or evaluate the
        preview remote cache for shared execution environments.
      `,
    },
  }),

  telemetry: langs({
    en: {
      headline: "Telemetry",

      subheadline: "Get insights into your tests and agents.",

      copy: txt`
        When tracing is enabled, Alumnium exports telemetry data to the
        endpoint you configure. Any OpenTelemetry-compatible collector is supported.
      `,
    },
  }),

  deviceCloud: langs({
    en: {
      headline: "Browser and Device Clouds",

      subheadline: "Access real devices and browsers in the cloud you use.",

      copy: txt`
        Alumnium works with cloud providers that offer real devices and browsers for testing.
        Whether you use Selenium Grid, Sauce Labs, TestMu, or another provider,
        Alumnium can connect to the cloud through the supported automation frameworks.
      `,
    },
  }),

  parallelism: langs({
    en: {
      headline: "Parallelism and Sharding",

      subheadline: "Run multiple tests in parallel across multiple machines.",

      copy: txt`
        Test runner supports parallel execution of tests within a single machine, and can be configured to split tests to run across multiple machines for large test suites.
      `,
    },
  }),

  //#endregion

  //#region Need More Reasons?

  needMore: langs({
    en: {
      kicker: "Project",

      headline: "Built in the Open",

      subheadline: "Inspect the source, follow development, and contribute.",
    },
  }),

  openSource: langs({
    en: {
      headline: "Open Source and Extensible",

      subheadline: "MIT-licensed and open to extension.",

      copy: txt`
        Alumnium's source is available under the MIT license for personal and
        commercial use. Development, issues, and pull requests happen in public.

        You can inspect, customize, and extend the project for your own testing
        workflows.
      `,
    },
  }),

  byExperts: langs({
    en: {
      headline: "Based on Decades of Experience",

      subheadline: txt`
        Built by product and quality engineering veterans.
      `,

      copy: txt`
        Alumnium draws on hands-on experience in QA, browser automation, and
        application development.

        Team members led established open-source projects,
        including Selenium and date-fns.
      `,
    },
  }),

  activeCommunity: langs({
    en: {
      headline: "Active Community",

      subheadline: txt`
        Questions, bug reports, and pull requests are welcome.
      `,

      copy: txt`
        Join the Discord community to ask questions, share feedback, or discuss
        a contribution before opening a pull request.
      `,
    },
  }),

  supportedBy: langs({
    en: {
      headline: "In a Good Company",

      subheadline: txt`
        Programs and infrastructure that support project development.
      `,

      copy: txt`
        Alumnium participates in programs that provide resources to open-source
        maintainers.
      `,
    },
  }),

  //#endregion

  //#region Comparison

  comparison: langs({
    en: {
      kicker: "Head to head",

      headline: "Alumnium Stands Out",

      subheadline: txt`
        See how we line up with other projects.
      `,
    },
  }),

  comparisonRun: langs({
    en: {
      headline: "Single-Task Comparison",

      subheadline: txt`
        We asked Claude Code with Opus 4.8 to test all YouTube search filters end-to-end as a user on web and Android.
      `,
    },
  }),

  comparisonRunTable: {
    header: comparisonHeader({
      metric: { en: "" },
      alumnium: { en: "Alumnium" },
      "browser-use": { en: "Browser Use" },
      "mobile-mcp": { en: "Mobile Next" },
      "playwright-mcp": { en: "Playwright" },
    }),

    rows: [
      comparisonRow({
        metric: {
          kind: "metric",
          value: {
            en: {
              label: "Main-agent tokens",
              subtext: txt`
                Tokens consumed in the coding agent's context during the task.
              `,
            },
          },
        },

        alumnium: {
          kind: "string",
          value: { en: "45,000" },
          highlight: "positive",
          note: {
            en: txt`
              Excluding ~1.7M tokens of GPT-5 Nano used by Alumnium MCP.
            `,
          },
        },

        "browser-use": {
          kind: "string",
          value: { en: "92,000" },
          highlight: "mixed",
        },

        "mobile-mcp": {
          kind: "string",
          value: { en: "143,000" },
          highlight: "mixed",
        },

        "playwright-mcp": {
          kind: "string",
          value: { en: "240,000" },
          highlight: "negative",
        },
      }),

      comparisonRow({
        metric: {
          kind: "metric",
          value: {
            en: {
              label: "Duration",
              subtext: txt`
                Elapsed time to complete the task.
              `,
            },
          },
        },

        alumnium: {
          kind: "string",
          value: { en: "20 mins" },
          highlight: "mixed",
          note: {
            en: md`
              Average of two session: 18 minutes on Android, 22 minutes on web.
            `,
          },
        },

        "browser-use": {
          kind: "string",
          value: { en: "20 mins" },
          highlight: "mixed",
        },

        "mobile-mcp": {
          kind: "string",
          value: { en: "16 mins" },
          highlight: "positive",
        },

        "playwright-mcp": {
          kind: "string",
          value: { en: "15 mins" },
          highlight: "positive",
        },
      }),

      comparisonRow({
        metric: {
          kind: "metric",
          value: {
            en: {
              label: "Cost",
              subtext: txt`
                Agent usage cost in USD for the task.
              `,
            },
          },
        },

        alumnium: {
          kind: "string",
          value: { en: "$3.73" },
          highlight: "positive",
          note: {
            en: md`
              Avereage of two sessions:

              - **Web:** $4.10 (Claude) + $0.08 (Alumnium MCP) = $4.18

              - **Android:** $3.27 (Claude) + $0.02 (Alumnium MCP) = $3.29
            `,
          },
        },

        "browser-use": {
          kind: "string",
          value: { en: "$6.57" },
          highlight: "mixed",
        },

        "mobile-mcp": {
          kind: "string",
          value: { en: "$12.79" },
          highlight: "negative",
        },

        "playwright-mcp": {
          kind: "string",
          value: { en: "$15.05" },
          highlight: "negative",
        },
      }),
    ],

    disclaimer: langs({
      en: md`
        Raw transcripts are available [here](https://gist.github.com/p0deje/fb5c8082cdd0542f74a30df93abfe018).
      `,
    }),
  },

  comparisonFeatures: langs({
    en: {
      headline: "Features Comparison",

      subheadline: txt`
        See how Alumnium compares to other projects in terms of features
        and capabilities.
      `,
    },
  }),

  comparisonFeaturesTable: {
    header: comparisonHeader({
      metric: { en: "" },
      alumnium: { en: "Alumnium" },
      "browser-use": { en: "Browser Use" },
      "mobile-mcp": { en: "Mobile Next" },
      "playwright-mcp": { en: "Playwright" },
    }),

    rows: [
      comparisonRow({
        metric: {
          kind: "metric",
          value: {
            en: {
              label: "Built-in test runner",
              subtext: txt`
                CLI capable of running Markdown scenarios locally or in CI.
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

        "mobile-mcp": {
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
              label: "TypeScript",
              subtext: "Native JS/TS client package.",
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

        "mobile-mcp": {
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
              label: "Python",
              subtext: "Native Python client package.",
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

        "mobile-mcp": {
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
              label: "Java",
              subtext: "Native Java client package.",
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

        "mobile-mcp": {
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
              label: "Web",
              subtext: "Test web applications.",
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

        "mobile-mcp": {
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
              label: "iOS",
              subtext: "Test iOS applications.",
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

        "mobile-mcp": {
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
              label: "Android",
              subtext: "Test Android applications.",
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

        "mobile-mcp": {
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

        "mobile-mcp": {
          kind: "string",
          value: { en: "Apache 2.0" },
          highlight: "positive",
        },

        "playwright-mcp": {
          kind: "string",
          value: { en: "Apache 2.0" },
          highlight: "positive",
        },
      }),
    ],

    disclaimer: langs({
      en: txt`
        * The Alumnium test runner is currently in preview.
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
        Practical answers about setup, cost, compatibility, and project maturity.
      `,

      items: [
        faqItem({
          id: "what-is-alumnium",

          value: langs({
            en: {
              question: "What is Alumnium?",

              answer: md`
                Alumnium is a suite of libraries and tools for natural-language end-to-end testing of web and mobile applications. It consists of:

                - MCP server for agentic testing;
                - client libraries for writing tests in Java, Python, and TypeScript;
                - test runner for executing Markdown scenarios locally or in CI; and
                - server for central model communication and caching.
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

                1. Selenium or Playwright for web automation.
                2. Appium or WebdriverIO for iOS and Android mobile testing.

                Client libraries let you add Alumnium incrementally alongside
                existing framework code. Exact capabilities vary by framework
                and platform, so check the documentation for current support.
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
                Alumnium makes its own requests to the model provider,
                so you generally need a valid API key or other credentials
                for the provider you choose. You can also run a supported
                model locally through Ollama, which does not require an API key.
                If you have ChatGPT subscriptions, you can use the Codex
                support to reuse your ChatGPT subscription in Alumnium

                See the [configuration guide](/docs/getting-started/configuration/)
                for the current provider matrix and setup instructions.
              `,
            },
          }),
        }),

        faqItem({
          id: "what-data-does-alumnium-send",

          value: langs({
            en: {
              question: "What data does Alumnium send to AI providers?",

              answer: md`
                When you use a hosted model, Alumnium sends the relevant
                natural-language instruction and UI context to that provider.
                Screenshots may also be sent when a vision-enabled operation
                needs them.

                Use a supported local model through Ollama when model inference
                must stay on infrastructure you control. OpenTelemetry tracing is
                optional and exports only to the endpoint you configure.
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
                Alumnium has no license fee and is available under the MIT
                license for personal and commercial use. You are only
                responsible for model provider, infrastructure, and automation
                service costs associated with your setup.
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
                Choose the entry point that matches your workflow:

                1. Agent: add the Alumnium MCP server.
                2. Existing test suite: install the Java, Python, or TypeScript
                   client and initialize it with Selenium, Playwright, or Appium.
                3. Markdown tests: use the test runner.

                See our [Getting Started guide](/docs/getting-started/installation/)
                and [MCP guide](/docs/guides/mcp/) for detailed instructions.
              `,
            },
          }),
        }),

        faqItem({
          id: "can-i-use-alumnium-with-claude-code-codex-or-gemini",

          value: langs({
            en: {
              question:
                "Can I use Alumnium with Claude Code, Codex, or Cursor?",

              answer: md`
                Yes. Alumnium provides a Model Context Protocol (MCP) server for
                compatible clients including Claude Code, Codex, and Cursor.
                An agent can use it to drive and verify browser or mobile
                applications, and engineers can build custom agents on the same
                high-level MCP tools.
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
                Alumnium is under active development and is currently used to
                power thousands of tests in production by early adopters.
                Start with non-critical test flows, review AI-generated scenarios,
                and expand usage as you validate it in your environment.
                Join the Discord community to share feedback and follow new releases.
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
};

export const ttLandings = {
  banners: {
    sota: {
      href: "/blog/webvoyager-benchmark/",

      headline: langs({
        en: "SOTA on WebVoyager with 98.5%",
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

      needMore: "Open Source",

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

  export interface ComparisonTable {
    header: ComparisonHeader;
    rows: ComparisonRow[];
    disclaimer?: I18n.FullLangsMap<string>;
  }

  export interface ComparisonHeader {
    metric: I18n.FullLangsMap<string>;
    alumnium: I18n.FullLangsMap<string>;
    "browser-use": I18n.FullLangsMap<string>;
    "mobile-mcp": I18n.FullLangsMap<string>;
    "playwright-mcp": I18n.FullLangsMap<string>;
  }

  export interface ComparisonRow {
    metric: ComparisonMetricCell;
    alumnium: ComparisonCell;
    "browser-use": ComparisonCell;
    "mobile-mcp": ComparisonCell;
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
    note?: I18n.FullLangsMap<string>;
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
