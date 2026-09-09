/**
 * Resolves what a CI run should do: the commit to test, the model providers and
 * drivers to use, and which downstream workflows to trigger.
 *
 * Automatic runs (pull requests, pushes, nightly schedule) use a single cheap
 * provider. Manual runs pick providers, drivers and clients from checkbox inputs.
 */
class Preflight {
  static SUPPORTED_CLIENTS = ["java", "python", "typescript"];
  static SUPPORTED_DRIVERS = [
    "appium-android",
    "appium-ios",
    "playwright",
    "selenium",
  ];
  static SUPPORTED_PROVIDERS = [
    "azure_foundry",
    "azure_openai",
    "anthropic",
    "aws_anthropic",
    "aws_meta",
    "codex",
    "cursor",
    "deepseek",
    "google",
    "mistralai",
    "ollama",
    "openai",
    "xai",
  ];

  // Keep in sync with ci-*.yml workflow_dispatch inputs default values.
  static DEFAULT_DRIVERS = ["selenium", "playwright"];
  static DEFAULT_PROVIDERS = ["azure_openai"];

  #context;
  #github;
  #core;
  #inputs;

  constructor({ context, github, core, workflowInputs }) {
    this.#context = context;
    this.#github = github;
    this.#core = core;
    this.#inputs =
      context.eventName === "workflow_dispatch"
        ? JSON.parse(workflowInputs)
        : {};
  }

  async run() {
    const outputs = {
      sha: await this.#sha(),
      models: JSON.stringify(this.#models()),
      drivers: JSON.stringify(this.#drivers()),
      ...(await this.#workflows()),
    };

    for (const [name, value] of Object.entries(outputs)) {
      this.#core.setOutput(name, value);
    }

    this.#core.info(JSON.stringify(outputs, null, 2));
    return outputs;
  }

  get #dispatched() {
    return this.#context.eventName === "workflow_dispatch";
  }

  get #pullRequest() {
    return this.#context.eventName === "pull_request"
      ? this.#context.payload.pull_request
      : null;
  }

  /**
   * Returns true if the workflow is running on a trusted branch or fork. This is
   * used to determine whether to run workflows that require secrets, such as
   * system tests and agent evaluations.
   *
   * Fork pull requests are untrusted because they can be modified by anyone, and
   * they can access secrets if the workflow is not careful. We only allow forks to
   * run build/lint/unit tests, which do not require secrets.
   * Maintainers can run the full suite on fork pull requests via
   * workflow_dispatch with the `pr` input after reviewing the changes.
   */
  get #trusted() {
    const { owner, repo } = this.#context.repo;
    return (
      !this.#pullRequest ||
      this.#pullRequest.head.repo.full_name === `${owner}/${repo}`
    );
  }

  /**
   * Returns the commit SHA to test. On pull requests, this is the merge commit if
   * the PR is mergeable, or the head commit if it has conflicts. On pushes and
   * workflow_dispatch runs, this is the commit that triggered the workflow.
   */
  async #sha() {
    if (this.#inputs.pr) {
      const { data } = await this.#github.rest.pulls.get({
        ...this.#context.repo,
        pull_number: Number(this.#inputs.pr),
      });
      return data.mergeable === false
        ? data.head.sha
        : (data.merge_commit_sha ?? data.head.sha);
    }

    // On pull requests this is already the merge commit.
    return this.#context.sha;
  }

  #models() {
    return this.#selection(
      Preflight.SUPPORTED_PROVIDERS,
      Preflight.DEFAULT_PROVIDERS,
    );
  }

  #drivers() {
    return this.#selection(
      Preflight.SUPPORTED_DRIVERS,
      Preflight.DEFAULT_DRIVERS,
    );
  }

  async #workflows() {
    const changed = await this.#changedPackages();
    const workflows = {
      "run-eval": this.#trusted && (!this.#dispatched || this.#inputs.eval),
    };

    for (const client of Preflight.SUPPORTED_CLIENTS) {
      // Java and Python clients both depend on the TypeScript core.
      const affected =
        !this.#pullRequest || changed.has(client) || changed.has("typescript");
      const selected = !this.#dispatched || Boolean(this.#inputs[client]);
      workflows[`run-${client}`] = this.#trusted && selected && affected;
    }

    return workflows;
  }

  // Packages touched by the pull request, used to skip unaffected clients.
  async #changedPackages() {
    const changed = new Set();
    if (!this.#pullRequest) return changed;

    const files = await this.#github.paginate(
      this.#github.rest.pulls.listFiles,
      {
        ...this.#context.repo,
        pull_number: this.#pullRequest.number,
        per_page: 100,
      },
    );

    const pattern = new RegExp(
      `^packages/(${Preflight.SUPPORTED_CLIENTS.join("|")})/`,
    );
    for (const { filename } of files) {
      const match = filename.match(pattern);
      if (match) changed.add(match[1]);
    }

    return changed;
  }

  #selection(available, fallback) {
    return this.#dispatched
      ? available.filter((name) => this.#inputs[name])
      : fallback;
  }
}

module.exports = Preflight;
