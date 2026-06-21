"use client";

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

type InputOption = {
  readonly id: string;
  readonly label: string;
  readonly style?: "default" | "danger" | "primary";
};

type MessageInputRequest = {
  readonly options?: readonly InputOption[];
  readonly prompt: string;
  readonly requestId: string;
};

export function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
}) {
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );

  return (
    <Message
      data-optimistic={message.metadata?.optimistic ? "true" : undefined}
      from={message.role}
    >
      <MessageContent>
        {message.parts.map((part, index) => (
          <AgentMessagePart
            canRespond={canRespond}
            key={partKey(part, index)}
            onInputResponses={onInputResponses}
            part={part}
            showCaret={isStreaming && message.role === "assistant" && index === lastTextIndex}
          />
        ))}
      </MessageContent>
    </Message>
  );
}

function AgentMessagePart({
  canRespond,
  onInputResponses,
  part,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return (
        <MessageResponse caret="block" isAnimating={showCaret}>
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return (
        <Reasoning defaultOpen isStreaming={part.state === "streaming"}>
          <ReasoningTrigger />
          <ReasoningContent isStreaming={part.state === "streaming"}>
            {part.text}
          </ReasoningContent>
        </Reasoning>
      );
    case "dynamic-tool":
      return (
        <Tool
          defaultOpen={part.state === "approval-requested" || part.state === "approval-responded"}
        >
          <ToolHeader
            state={part.state}
            title={part.toolName}
            toolName={part.toolName}
            type="dynamic-tool"
          />
          <ToolContent>
            <ToolInput input={part.input} />
            <InputRequestActions
              canRespond={canRespond}
              part={part}
              onInputResponses={onInputResponses}
            />
            <ToolOutput errorText={part.errorText} output={part.output} />
          </ToolContent>
        </Tool>
      );
  }
}

function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: (responses: readonly AgentInputResponse[]) => void | Promise<void>;
  readonly part: EveDynamicToolPart;
}) {
  const inputRequest = getInputRequest(part);
  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );

  return (
    <div className="space-y-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
      <p className="text-muted-foreground text-sm">{inputRequest.prompt}</p>
      {inputResponse ? (
        <p className="font-medium text-sm">
          Responded: {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options?.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  {
                    optionId: option.id,
                    requestId: inputRequest.requestId,
                  },
                ]);
              }}
              size="sm"
              type="button"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function getInputRequest(part: EveDynamicToolPart): MessageInputRequest | null {
  const metadataRequest = part.toolMetadata?.eve?.inputRequest;
  if (isMessageInputRequest(metadataRequest)) {
    return metadataRequest;
  }

  if (part.toolName !== "ask_question" || part.approval?.id === undefined) {
    return null;
  }

  const input = part.input;
  if (!isAskQuestionInput(input)) {
    return null;
  }

  return {
    options: input.options,
    prompt: input.prompt,
    requestId: part.approval.id,
  };
}

function isMessageInputRequest(value: unknown): value is MessageInputRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as {
    options?: unknown;
    prompt?: unknown;
    requestId?: unknown;
  };

  return (
    typeof request.prompt === "string" &&
    typeof request.requestId === "string" &&
    (request.options === undefined || isInputOptions(request.options))
  );
}

function isAskQuestionInput(value: unknown): value is { options?: readonly InputOption[]; prompt: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const input = value as {
    options?: unknown;
    prompt?: unknown;
  };

  return typeof input.prompt === "string" && (input.options === undefined || isInputOptions(input.options));
}

function isInputOptions(value: unknown): value is readonly InputOption[] {
  return Array.isArray(value) && value.every(isInputOption);
}

function isInputOption(value: unknown): value is InputOption {
  if (!value || typeof value !== "object") {
    return false;
  }

  const option = value as {
    id?: unknown;
    label?: unknown;
    style?: unknown;
  };

  return (
    typeof option.id === "string" &&
    typeof option.label === "string" &&
    (option.style === undefined ||
      option.style === "default" ||
      option.style === "danger" ||
      option.style === "primary")
  );
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}
