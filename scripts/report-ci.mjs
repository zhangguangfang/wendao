import { readFile } from "node:fs/promises";

// Publish concise, synthetic-test errors as Actions annotations. Full logs can
// require authentication; annotations make cross-environment failures reviewable.
const report = JSON.parse(await readFile("ci-results.json", "utf8"));
const escape = (value) => value.replace(/\x1b\[[0-9;]*m/g, "").replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
function visit(suites) {
  for (const suite of suites ?? []) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.status !== "unexpected") continue;
        const errors = test.results.flatMap((result) => result.errors ?? []).map((error) => error.message ?? "Unknown test failure").join("\n");
        console.log(`::error title=Browser check failed::${escape(`${spec.title}: ${errors}`.slice(0, 2400))}`);
      }
    }
    visit(suite.suites);
  }
}
visit(report.suites);
for (const error of report.errors ?? []) console.log(`::error title=Browser runner failed::${escape((error.message ?? "Unknown error").slice(0, 2400))}`);
