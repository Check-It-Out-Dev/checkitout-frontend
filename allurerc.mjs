// Allure 3 configuration for the Playwright tiers.
//
// Allure 3 dropped the history/ directory Allure 2 wrote inside the report; history now lives in one
// JSON-lines file named here, and `allure generate` both reads it (to mark new, retried and flaky tests
// and to draw the trend) and appends the run to it. The CI jobs carry this file on the Pages site, one
// per workflow, because browser-tiers, nightly-full-stack and k8s-test-execution run different suites:
// a shared history would report every test of the other suite as new on every run.
export default {
  name: 'checkitout frontend',
  output: './allure-report',
  historyPath: './history.jsonl',
};
