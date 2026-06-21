import { defineAgent } from "eve";
import { deepseek } from "@ai-sdk/deepseek";

export default defineAgent({
  model: deepseek("deepseek-v4-pro"),
});
