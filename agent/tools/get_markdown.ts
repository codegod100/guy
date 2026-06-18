import { defineTool } from "eve/tools";
import { z } from "zod";

// The runtime tool name comes from the filename, so the model sees `get_markdown`.
export default defineTool({
  description:
    "Fetch a URL and return its content as clean Markdown via jina.ai's Reader API.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL to fetch and convert to Markdown"),
  }),
  async execute({ url }) {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/markdown" },
    });

    if (!response.ok) {
      throw new Error(
        `jina.ai returned ${response.status}: ${response.statusText}`,
      );
    }

    const markdown = await response.text();
    return { markdown };
  },
});
