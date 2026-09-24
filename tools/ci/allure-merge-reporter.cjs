// allure-playwright, made to survive `playwright merge-reports`.
//
// When the tests run, Playwright calls a reporter's onConfigure with a config that already carries its
// projects. When blob reports are merged it does not: the merge replays the recorded events in order, and
// onConfigure is replayed before any onProject, so `config.projects` is still empty. The same object is
// filled in afterwards, one onProject at a time, before onBegin.
//
// allure-playwright (3.12.x) reads `config.projects[0].outputDir` inside onConfigure. Under a merge that
// throws, Playwright records a reporter error, every onTestBegin that follows finds no config either, the
// merged run ends "failed", merge-reports exits 1, and the workflow step stops before `allure generate`.
// The Allure report was never built, on green nights or red ones; the dashboard only said "no allure
// report, skipped".
//
// So this reporter holds on to the config and hands it to allure-playwright at onBegin, when the projects
// are there. Everything else is passed straight through.
const AllureReporter = require('allure-playwright').default ?? require('allure-playwright');

module.exports = class AllureMergeReporter {
  constructor(options) {
    this.inner = new AllureReporter(options);
  }

  version() {
    return 'v2';
  }

  onConfigure(config) {
    this.config = config;
  }

  onBegin(suite) {
    this.inner.onConfigure(this.config);
    return this.inner.onBegin(suite);
  }

  onTestBegin(...args) {
    return this.inner.onTestBegin?.(...args);
  }

  onStepBegin(...args) {
    return this.inner.onStepBegin?.(...args);
  }

  onStepEnd(...args) {
    return this.inner.onStepEnd?.(...args);
  }

  onStdOut(...args) {
    return this.inner.onStdOut?.(...args);
  }

  onStdErr(...args) {
    return this.inner.onStdErr?.(...args);
  }

  onTestEnd(...args) {
    return this.inner.onTestEnd?.(...args);
  }

  onError(...args) {
    return this.inner.onError?.(...args);
  }

  onEnd(...args) {
    return this.inner.onEnd?.(...args);
  }

  onExit(...args) {
    return this.inner.onExit?.(...args);
  }

  printsToStdio() {
    return false;
  }
};
