import { langs } from "./i18n";
import { txt } from "smollit";

export const ttLandings = {
  banners: {
    sota: {
      href: "/blog/webvoyager-benchmark/",

      headline: langs({
        en: "SOTA on WebVoyager 98.5%",
      }),
    },
  },

  sections: {
    hero: langs({
      en: {
        headline: txt`
          <b>End-to-End Testing with AI</b>
          <br/>
          for [Agents](/for/agents) and [Engineers](/for/engineers)
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

    // TODO: Prioritize and detalize + lead to pages
    // TODO: Turn into get started
    getStarted: langs({
      en: {
        kicker: "Start",

        headline: "Get Started",

        // subheadline: txt`
        //   Works for everyone: QA engineers, developers using AI agents, vibe
        //   coders, and everyone in between.
        // `,

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

    //#endregion

    //#region AI Tests

    aiTests: langs({
      en: {
        headline: "AI Tests the Right Way TK",

        subheadline: "TODO",
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

    // TODO: Join with efficient

    tlDr: langs({
      en: {
        bill: "Of a bill vs playwright-mcp on the same task",

        webVoyager: "WebVoyager SOTA · public",

        cost: (cost: number) => `Per task vs $${cost} playwright-mcp`,

        context: (alumnium: number, comparison: number) =>
          `Less context · ${alumnium}k vs ${comparison}k tokens`,
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

            subheadline: "TODO",

            copy: txt`
              TODO

              TODO
            `,
          },

          {
            icon: "avg_pace",

            headline: "Long-Horizon Tasks",

            subheadline: "TODO",

            copy: txt`
              TODO

              TODO
            `,
          },

          {
            icon: "graph_1",

            headline: "Prevents Context Rot",

            subheadline: "TODO",

            copy: txt`
              TODO

              TODO
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
        kicker: "Ship",

        headline: "Tests That Unblock Your Features",

        copy: txt`
          Historically, while ensuring quality, the end-to-end tests also slow
          down new features and require constant adjustments to keep them running.

          TODO
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

        subheadline: "TODO",

        copy: txt`
          TODO

          TODO
        `,
      },
    }),

    //#endregion

    //#region Scalable

    scalable: langs({
      en: {
        kicker: "Scale",

        headline: "Scalability TK",

        subheadline: "TODO",
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

    //#endregion

    //#region Comparison

    comparison: langs({
      en: {
        kicker: "TODO",

        headline: "Alumnium is Different",

        subheadline: txt`
          TODO
        `,

        copy: txt`
          TODO: Context isolation

          TODO: Doesn't need frontier models

          TODO: Open Telemetry

          TODO: Doesn't rely on vision

          TODO: Doesn't generate tests

          TODO: Multiple use cases: MCP for agents, test runner, web, mobile, etc.

          TODO: Not a black box

          TODO: Not a generic browser tool

          TODO: ^^^ prev 2 -> middle path, a building block

          TODO: No lock-in (vs Browser Use)

          TODO: Easy to migrate, no lock-in into model/approach (i.e. Playwright
          -> Alumnium -> Playwright)

          TODO: Runs locally

          TODO: Local models
        `,
      },
    }),

    // TODO: Comparison + join Alumnium is Different + table

    //#endregion

    //#region FAQ

    faq: langs({
      en: {
        kicker: "FAQ",

        headline: "Frequently Asked Questions",

        subheadline: txt`
          Still have questions? We got you covered.
        `,
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
