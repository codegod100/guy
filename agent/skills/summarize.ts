import { defineSkill } from "eve/skills";

export default defineSkill({
  description:
    "Summarize the content of a URL by fetching it as Markdown and producing a concise summary.",
  markdown: `
## Summarize

When asked to summarize a URL, follow this workflow:

1. **Fetch the content**: Use the \`get_markdown\` tool with the target URL to retrieve the page as clean Markdown.
2. **Read & distill**: Analyze the returned Markdown and produce a **concise summary** that captures:
   - The main topic or purpose of the page
   - Key points, arguments, or findings (prioritize the most important 3–5)
   - Any actionable conclusions or next steps, if present
3. **Format the summary** clearly:
   - Start with a one-sentence TL;DR
   - Follow with bullet points for key takeaways
   - Keep the entire summary under 300 words unless the user asks for more detail

If the page is very long or the user wants a more detailed summary, mention that you can be asked for deeper coverage of specific sections.
`.trim(),
});
