import { defineTool } from "eve/tools";
import { z } from "zod";

// The runtime tool name comes from the filename, so the model sees `get_weather`.
export default defineTool({
  description: "Get the current weather for a city.",
  inputSchema: z.object({
    city: z.string(),
  }),
  async execute({ city }) {
    return { city, condition: "Sunny", temperatureF: 25 };
  },
});
