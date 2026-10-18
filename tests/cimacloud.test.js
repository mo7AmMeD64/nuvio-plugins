// Smoke test for the CimaCloud scraper: node tests/cimacloud.test.js
// Hits the live API end to end (attestation crypto + encrypted server lists),
// so a failure can also mean the app rotated its keys or the site changed hosts.
const assert = require("assert");
const { getStreams } = require("../providers/cimacloud.js");

const cases = [
  ["Inception (movie, search by English title)", 27205, "movie", null, null],
  ["Breaking Bad S1E1 (series + episodes API)", 1396, "tv", 1, 1],
  ["Miracle in Cell No. 7 2019 (matched via the Arabic translation)", 637920, "movie", null, null],
];

(async () => {
  let failed = 0;
  for (const [label, id, type, s, e] of cases) {
    try {
      const streams = await getStreams(id, type, s, e);
      assert(streams.length > 0, "no streams");
      assert(streams.every((x) => /^https?:/.test(x.url)), "non-http url");
      assert(streams.every((x) => x.provider === "cimacloud"), "missing provider tag");
      console.log("PASS", label, `(${streams.length} streams)`);
    } catch (err) {
      failed++;
      console.log("FAIL", label, "-", err.message);
    }
  }
  process.exit(failed ? 1 : 0);
})();
