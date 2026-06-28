import type { LanguageModel } from "ai";
import type {
  JSONObject,
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4FinishReason,
  LanguageModelV4FunctionTool,
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from "@ai-sdk/provider";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import {
  combineHeaders,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  generateId,
  parseProviderOptions,
  postJsonToApi,
} from "@ai-sdk/provider-utils";
import { z } from "zod";

type OpenAICompatibleLanguageModelConfig = {
  provider: string;
  modelId: string;
  baseURL: string;
  apiKey?: string;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  /**
   * Hard cap on tokens generated per turn. The value is forwarded as
   * `max_tokens` in the chat-completions request body. Most OpenAI-
   * compatible providers honor it; setting it is the primary lever for
   * keeping the assistant's replies short — capping at the runner level
   * just truncates an already-long reply, but capping here forces the
   * model to fit its answer inside the budget.
   */
  maxTokens?: number;
};

type OAIChatMessage =
  | { role: "system" | "developer"; content: string }
  | { role: "user"; content: string | Array<Record<string, unknown>> }
  | {
      role: "assistant";
      content: string | null;
      reasoning_content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

type OAIChatRequestBody = {
  model: string;
  messages: OAIChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  seed?: number;
  stream?: boolean;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "function"; function: { name: string } };
};

const usageSchema = z
  .object({
    prompt_tokens: z.number().nullish(),
    completion_tokens: z.number().nullish(),
    total_tokens: z.number().nullish(),
  })
  .nullish();

const choiceSchema = z.object({
  index: z.number(),
  finish_reason: z.string().nullable(),
  message: z.object({
    role: z.literal("assistant"),
    content: z.string().nullable(),
    reasoning: z.string().nullish(),
    reasoning_content: z.string().nullish(),
    tool_calls: z
      .array(
        z.object({
          id: z.string().nullish(),
          type: z.literal("function"),
          function: z.object({
            name: z.string(),
            arguments: z.string(),
          }),
        }),
      )
      .nullish(),
  }),
});

const responseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(choiceSchema).min(1),
  usage: usageSchema,
});

const chunkChoiceSchema = z.object({
  index: z.number(),
  delta: z.object({
    role: z.union([z.literal("assistant"), z.literal("user")]).nullish(),
    content: z.string().nullish(),
    reasoning: z.string().nullish(),
    reasoning_content: z.string().nullish(),
    tool_calls: z
      .array(
        z.object({
          index: z.number(),
          id: z.string().nullish(),
          type: z.literal("function").nullish(),
          function: z
            .object({
              name: z.string().nullish(),
              arguments: z.string().nullish(),
            })
            .nullish(),
        }),
      )
      .nullish(),
  }),
  finish_reason: z.string().nullable().nullish(),
});

const chunkSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(chunkChoiceSchema).min(1),
  usage: usageSchema.nullish(),
});

const errorSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

const chunkUnionSchema = z.union([chunkSchema, errorSchema]);

function convertUsage(raw: z.infer<typeof usageSchema>): LanguageModelV4Usage {
  const prompt = raw?.prompt_tokens ?? undefined;
  const completion = raw?.completion_tokens ?? undefined;
  return {
    inputTokens: {
      total: prompt,
      noCache: prompt,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: completion,
      text: completion,
      reasoning: undefined,
    },
    raw: raw as unknown as JSONObject,
  };
}

function mapFinishReason(raw: string | null | undefined): LanguageModelV4FinishReason {
  switch (raw) {
    case "stop":
    case "eos":
      return { unified: "stop", raw: raw ?? undefined };
    case "length":
    case "max_tokens":
      return { unified: "length", raw: raw ?? undefined };
    case "content_filter":
    case "safety":
      return { unified: "content-filter", raw: raw ?? undefined };
    case "tool_calls":
    case "function_call":
      return { unified: "tool-calls", raw: raw ?? undefined };
    default:
      return { unified: raw ? "other" : "stop", raw: raw ?? undefined };
  }
}

function convertMessages(prompt: LanguageModelV4Prompt): {
  messages: OAIChatMessage[];
  warnings: SharedV4Warning[];
} {
  const warnings: SharedV4Warning[] = [];
  const messages: OAIChatMessage[] = [];

  for (const message of prompt) {
    if (message.role === "system") {
      messages.push({ role: "system", content: message.content });
      continue;
    }

    if (message.role === "user") {
      const textParts: string[] = [];
      const otherParts: Array<Record<string, unknown>> = [];

      for (const part of message.content) {
        if (part.type === "text") {
          textParts.push(part.text);
        } else {
          warnings.push({
            type: "unsupported",
            feature: `user file part (${part.mediaType})`,
            details: "Dropping file content; this provider only forwards text in user messages.",
          });
        }
      }

      if (otherParts.length > 0) {
        messages.push({
          role: "user",
          content: [...textParts.map((t) => ({ type: "text", text: t })), ...otherParts],
        });
      } else {
        messages.push({ role: "user", content: textParts.join("") });
      }
      continue;
    }

    if (message.role === "assistant") {
      let text = "";
      const toolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
      let reasoning: string | undefined;

      for (const part of message.content) {
        switch (part.type) {
          case "text":
            text += part.text;
            break;
          case "reasoning":
            reasoning = (reasoning ?? "") + part.text;
            break;
          case "tool-call":
            toolCalls.push({
              id: part.toolCallId,
              type: "function",
              function: {
                name: part.toolName,
                arguments:
                  typeof part.input === "string" ? part.input : JSON.stringify(part.input),
              },
            });
            break;
          default:
            warnings.push({
              type: "unsupported",
              feature: `assistant ${part.type} part`,
            });
            break;
        }
      }

      const assistantMessage: {
        role: "assistant";
        content: string | null;
        reasoning_content?: string;
        tool_calls?: typeof toolCalls;
      } = {
        role: "assistant",
        content: text.length > 0 ? text : null,
      };
      if (reasoning) assistantMessage.reasoning_content = reasoning;
      if (toolCalls.length > 0) assistantMessage.tool_calls = toolCalls;
      messages.push(assistantMessage);
      continue;
    }

    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type === "tool-result") {
          const value = part.output;
          let serialized: string;
          switch (value.type) {
            case "text":
              serialized = value.value;
              break;
            case "json":
              serialized = JSON.stringify(value.value);
              break;
            case "error-text":
              serialized = JSON.stringify({ error: value.value });
              break;
            case "error-json":
              serialized = JSON.stringify(value.value);
              break;
            case "content":
              serialized = JSON.stringify(value.value);
              break;
            case "execution-denied":
              serialized = JSON.stringify({ denied: true, reason: value.reason });
              break;
          }
          messages.push({ role: "tool", tool_call_id: part.toolCallId, content: serialized });
        } else if (part.type === "tool-approval-response") {
          warnings.push({
            type: "unsupported",
            feature: "tool approval response",
          });
        }
      }
    }
  }

  return { messages, warnings };
}

function convertTools(
  tools: Array<LanguageModelV4FunctionTool | { type: "provider" }> | undefined,
): {
  tools: OAIChatRequestBody["tools"];
  warnings: SharedV4Warning[];
} {
  const warnings: SharedV4Warning[] = [];
  if (!tools || tools.length === 0) return { tools: undefined, warnings };

  const out: NonNullable<OAIChatRequestBody["tools"]> = [];
  for (const tool of tools) {
    if (tool.type === "provider") {
      warnings.push({
        type: "unsupported",
        feature: `provider-defined tool ${(tool as { id?: string }).id ?? "(unknown)"}`,
      });
      continue;
    }
    out.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>,
      },
    });
  }
  return { tools: out, warnings };
}

function buildBody(
  options: LanguageModelV4CallOptions,
  config: OpenAICompatibleLanguageModelConfig,
): {
  body: OAIChatRequestBody;
  warnings: SharedV4Warning[];
} {
  const warnings: SharedV4Warning[] = [];
  const { messages, warnings: msgWarnings } = convertMessages(options.prompt);
  warnings.push(...msgWarnings);

  if (options.topK !== undefined) {
    warnings.push({ type: "unsupported", feature: "topK" });
  }
  if (options.reasoning !== undefined && options.reasoning !== "provider-default") {
    warnings.push({
      type: "compatibility",
      feature: "reasoning effort",
      details: `Forwarded via OpenAI-compatible field; provider may ignore '${options.reasoning}'.`,
    });
  }
  if (options.responseFormat?.type === "json") {
    warnings.push({
      type: "unsupported",
      feature: "responseFormat schema",
      details: "JSON schema responses are not enforced; sending without response_format.",
    });
  }

  const { tools, warnings: toolWarnings } = convertTools(options.tools);
  warnings.push(...toolWarnings);

  const toolChoice = options.toolChoice;
  const body: OAIChatRequestBody = {
    model: "",
    messages,
  };
  // Per-turn `maxOutputTokens` wins over the model-config default.
  // Config default applies when the harness doesn't pin a value, which is
  // the common case — that's the lever for "make this model terser".
  if (options.maxOutputTokens !== undefined) {
    body.max_tokens = options.maxOutputTokens;
  } else if (config.maxTokens !== undefined) {
    body.max_tokens = config.maxTokens;
  }
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.topP !== undefined) body.top_p = options.topP;
  if (options.frequencyPenalty !== undefined) body.frequency_penalty = options.frequencyPenalty;
  if (options.presencePenalty !== undefined) body.presence_penalty = options.presencePenalty;
  if (options.stopSequences && options.stopSequences.length > 0) body.stop = options.stopSequences;
  if (options.seed !== undefined) body.seed = options.seed;
  if (tools) body.tools = tools;
  if (toolChoice) {
    switch (toolChoice.type) {
      case "auto":
      case "none":
      case "required":
        body.tool_choice = toolChoice.type;
        break;
      case "tool":
        body.tool_choice = { type: "function", function: { name: toolChoice.toolName } };
        break;
    }
  }

  return { body, warnings };
}

function buildHeaders(
  config: OpenAICompatibleLanguageModelConfig,
  optionsHeaders?: Record<string, string | undefined>,
) {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) base["Authorization"] = `Bearer ${config.apiKey}`;
  return combineHeaders({ ...base, ...(config.headers?.() ?? {}) }, optionsHeaders);
}

export class OpenAICompatibleLanguageModelV4 implements LanguageModelV4 {
  readonly specificationVersion = "v4" as const;
  readonly provider: string;
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private readonly config: OpenAICompatibleLanguageModelConfig;
  private readonly failedResponseHandler: ReturnType<typeof createJsonErrorResponseHandler>;
  private readonly metadataKey: string;

  constructor(config: OpenAICompatibleLanguageModelConfig) {
    this.provider = config.provider;
    this.modelId = config.modelId;
    this.config = config;
    this.failedResponseHandler = createJsonErrorResponseHandler({
      errorSchema: z.object({
        error: z.object({
          message: z.string(),
          type: z.string().nullish(),
          code: z.union([z.string(), z.number()]).nullish(),
        }),
      }),
      errorToMessage: (data) => data.error.message,
    });
    this.metadataKey = config.provider.split(".")[0].trim();
  }

  async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    const { body, warnings } = buildBody(options, this.config);
    body.model = this.modelId;

    const providerOpts = await parseProviderOptions({
      provider: this.metadataKey,
      providerOptions: options.providerOptions,
      schema: z.record(z.string(), z.unknown()).optional(),
    });

    const { responseHeaders, value: responseBody, rawValue: rawResponse } = await postJsonToApi({
      url: `${this.config.baseURL.replace(/\/$/, "")}/chat/completions`,
      headers: buildHeaders(this.config, options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const choice = responseBody.choices[0];
    const content: LanguageModelV4Content[] = [];

    if (choice.message.content && choice.message.content.length > 0) {
      content.push({ type: "text", text: choice.message.content });
    }

    const reasoning = choice.message.reasoning_content ?? choice.message.reasoning;
    if (reasoning && reasoning.length > 0) {
      content.push({ type: "reasoning", text: reasoning });
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: "tool-call",
          toolCallId: tc.id ?? generateId(),
          toolName: tc.function.name,
          input: tc.function.arguments,
        });
      }
    }

    const providerMetadata: SharedV4ProviderMetadata = providerOpts
      ? { [this.metadataKey]: providerOpts as unknown as JSONObject }
      : { [this.metadataKey]: {} };

    return {
      content,
      finishReason: mapFinishReason(choice.finish_reason),
      usage: convertUsage(responseBody.usage),
      providerMetadata,
      request: { body },
      response: {
        id: responseBody.id ?? undefined,
        timestamp: responseBody.created ? new Date(responseBody.created * 1000) : undefined,
        modelId: responseBody.model ?? undefined,
        headers: responseHeaders,
        body: rawResponse,
      },
      warnings,
    };
  }

  async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
    const { body, warnings } = buildBody(options, this.config);
    body.model = this.modelId;
    body.stream = true;

    const { value: response, responseHeaders, rawValue: rawResponse } = await postJsonToApi({
      url: `${this.config.baseURL.replace(/\/$/, "")}/chat/completions`,
      headers: buildHeaders(this.config, options.headers),
      body,
      failedResponseHandler: this.failedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(chunkUnionSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const metadataKey = this.metadataKey;
    const includeRawChunks = options.includeRawChunks === true;
    const textId = generateId();
    let textStarted = false;
    const reasoningId = generateId();
    let reasoningStarted = false;
    const toolCallIds = new Map<number, string>();
    const toolCallNames = new Map<number, string>();
    const toolCallArgs = new Map<number, string>();
    let lastUsage: z.infer<typeof usageSchema> | undefined;
    let lastFinishReason: LanguageModelV4FinishReason = {
      unified: "other",
      raw: undefined,
    };
    let finishEmitted = false;

    type ChunkResult = { success: true; value: z.infer<typeof chunkUnionSchema>; rawValue?: unknown } | { success: false; error: unknown; rawValue?: unknown };

const stream = (response as ReadableStream<ChunkResult>).pipeThrough(
      new TransformStream<ChunkResult, LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings });
        },
        async transform(chunk, controller) {
          if (includeRawChunks) {
            controller.enqueue({ type: "raw", rawValue: chunk });
          }
          if (!chunk.success) {
            controller.enqueue({
              type: "error",
              error: chunk.error,
            });
            return;
          }

          const data = chunk.value;
          if ("error" in data) {
            controller.enqueue({
              type: "error",
              error: new Error(data.error.message),
            });
            return;
          }

          const choice = data.choices[0];
          if (!choice) return;

          if (data.id) {
            controller.enqueue({
              type: "response-metadata",
              id: data.id,
              modelId: data.model ?? undefined,
              timestamp: data.created != null ? new Date(data.created * 1000) : undefined,
            });
          }

          if (data.usage != null) {
            lastUsage = data.usage;
          }

          const delta = choice.delta;

          if (delta.content) {
            if (!textStarted) {
              controller.enqueue({ type: "text-start", id: textId });
              textStarted = true;
            }
            controller.enqueue({ type: "text-delta", id: textId, delta: delta.content });
          }

          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (reasoning) {
            if (!reasoningStarted) {
              controller.enqueue({ type: "reasoning-start", id: reasoningId });
              reasoningStarted = true;
            }
            controller.enqueue({ type: "reasoning-delta", id: reasoningId, delta: reasoning });
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              let toolCallId = toolCallIds.get(tc.index);
              if (!toolCallId) {
                toolCallId = tc.id ?? generateId();
                toolCallIds.set(tc.index, toolCallId);
                const toolName = tc.function?.name ?? "";
                toolCallNames.set(tc.index, toolName);
                toolCallArgs.set(tc.index, "");
                controller.enqueue({
                  type: "tool-input-start",
                  id: toolCallId,
                  toolName,
                });
              } else if (tc.function?.name) {
                toolCallNames.set(tc.index, tc.function.name);
              }
              if (tc.function?.arguments) {
                toolCallArgs.set(
                  tc.index,
                  (toolCallArgs.get(tc.index) ?? "") + tc.function.arguments,
                );
                controller.enqueue({
                  type: "tool-input-delta",
                  id: toolCallId,
                  delta: tc.function.arguments,
                });
              }
            }
          }

          if (choice.finish_reason != null) {
            lastFinishReason = mapFinishReason(choice.finish_reason);
          }
        },
        flush(controller) {
          if (textStarted) {
            controller.enqueue({ type: "text-end", id: textId });
          }
          if (reasoningStarted) {
            controller.enqueue({ type: "reasoning-end", id: reasoningId });
          }
          for (const [index, toolCallId] of toolCallIds) {
            controller.enqueue({ type: "tool-input-end", id: toolCallId });
            controller.enqueue({
              type: "tool-call",
              toolCallId,
              toolName: toolCallNames.get(index) ?? "",
              input: toolCallArgs.get(index) ?? "",
            });
          }
          if (!finishEmitted) {
            controller.enqueue({
              type: "finish",
              finishReason: lastFinishReason,
              usage: convertUsage(lastUsage),
              providerMetadata: { [metadataKey]: {} },
            });
            finishEmitted = true;
          }
        },
      }),
    );

    return {
      stream,
      request: { body },
      response: {
        headers: responseHeaders,
      },
    };
  }
}

export type OpenAICompatibleLanguageModelFactory = (
  modelId: string,
) => OpenAICompatibleLanguageModelV4;

export function createOpenAICompatibleLanguageModelV4(
  init: Omit<OpenAICompatibleLanguageModelConfig, "modelId">,
): OpenAICompatibleLanguageModelFactory {
  return (modelId) =>
    new OpenAICompatibleLanguageModelV4({
      ...init,
      modelId,
    });
}