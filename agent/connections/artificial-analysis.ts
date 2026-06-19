import { defineOpenAPIConnection } from "eve/connections";

export default defineOpenAPIConnection({
  spec: "https://artificialanalysis.ai/api/v2/openapi",
  description:
    "AI model benchmarks, pricing, and performance data. Covers language models (evaluations, speed, cost), image/video/music/speech arena rankings, and CritPt code evaluation. Free tier sees public fields only; Pro/Commercial unlocks richer detail.",
  headers: {
    "x-api-key": () => {
      const key = process.env.ARTIFICIAL_ANALYSIS_API_KEY;
      if (!key) {
        throw new Error(
          "ARTIFICIAL_ANALYSIS_API_KEY is not set. Get a key at https://artificialanalysis.ai/login",
        );
      }
      return key;
    },
  },
});
