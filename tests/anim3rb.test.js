const assert = require("assert");

const realFetch = global.fetch;
global.fetch = async (url, options) => {
  const res = await realFetch(url, options);
  const text = await res.text();
  const body = text.length > 1048576 ? text.slice(0, 1048576) + "\n...[truncated]" : text;
  return {
    ok: res.ok,
    status: res.status,
    headers: { get: (name) => res.headers.get(name) },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
};

const { getStreams } = require("../providers/anim3rb.js");

const cases = [
  ["Mushoku Tensei S1E12 (one TMDB season split into two cours)", 94664, "tv", 1, 12],
  ["Demon Slayer S3E1 (same episode count as S4)", 85937, "tv", 3, 1],
  ["Jujutsu Kaisen S1E2 (TMDB merges every part in one season)", 95479, "tv", 1, 2],
  ["One Piece S21E6 (global numbering past the 1MB runtime cap)", 37854, "tv", 21, 6],
  ["One Piece Film: Red (movie)", 900667, "movie", null, null],
];

(async () => {
  let failed = 0;
  for (const [label, id, type, s, e] of cases) {
    try {
      const streams = await getStreams(id, type, s, e);
      assert(streams.length > 0, "no streams");
      assert(streams.every((x) => /^https?:/.test(x.url)), "non-http url");
      assert(streams.every((x) => x.provider === "anim3rb"), "missing provider tag");
      console.log("PASS", label, `(${streams.length} streams)`);
    } catch (err) {
      failed++;
      console.log("FAIL", label, "-", err.message);
    }
  }
  process.exit(failed ? 1 : 0);
})();
