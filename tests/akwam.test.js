const { getStreams } = require("../providers/akwam.js");

async function testAkwam() {
  console.log("Testing Akwam plugin with search/stream flow...");
  const streams = await getStreams("550", "movie");
  console.log("Result streams count:", streams.length);
  if (streams.length > 0) {
    console.log("Sample stream:", streams[0]);
  }
}

testAkwam();