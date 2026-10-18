const assert = require("assert");
const { getStreams } = require("../providers/animewitcher.js");

const cases = [
  ["Mushoku S1E1 -> base entry", 94664, "tv", 1, 1, ["MmfwB2Ke"]],
  ["Mushoku S2E13 -> II Part 2 ep 1 (group math)", 94664, "tv", 2, 13, ["X2aThFZS", "Vk8brWP5", "JkUAxsbH"]],
  ["JJK S2E1 -> 2nd Season entry (TMDB has no S2)", 95479, "tv", 2, 1, ["Po6kF3QB"]],
  ["Kimetsu S3E1 -> Yuukaku-hen", 85937, "tv", 3, 1, ["aHSvBwBQ"]],
  ["Kimetsu S4E1 -> Katanakaji (same count as S3, air year breaks tie)", 85937, "tv", 4, 1, ["6ZwBoUcD", "U5TEJNdQ", "CTxKQxc8"]],
  ["Kimetsu S5E1 -> Hashira Geiko-hen", 85937, "tv", 5, 1, ["htNw2oQw", "GzsBdVvS", "khDZvDcY"]],
];

(async () => {
  let failed = 0;
  for (const [label, id, type, s, e, ids] of cases) {
    try {
      const streams = await getStreams(id, type, s, e);
      assert(streams.length > 0, "no streams");
      assert(streams.every(x => /^https?:/.test(x.url)), "non-http url");
      assert(streams.some(x => ids.some(v => x.url.includes(v))), "wrong episode/entry");
      console.log("PASS", label);
    } catch (err) {
      failed++;
      console.log("FAIL", label, "-", err.message);
    }
  }
  const movie = await getStreams(372058, "movie").catch(() => []);
  if (movie.length && movie.every(x => /^https?:/.test(x.url))) console.log("PASS movie: Your Name");
  else { failed++; console.log("FAIL movie: Your Name"); }
  process.exit(failed ? 1 : 0);
})();
