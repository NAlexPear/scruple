import {
  LLM_SYSTEM_PROMPT,
  parseStructuredAnswer,
  type LlmCallResult,
  type LlmEvaluator,
} from "@scruple/eval/llm-benchmark";

export const createOpenAiEvaluator = (options: {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}): LlmEvaluator => {
  if (options.apiKey.length === 0) {
    throw new Error("OPENAI_API_KEY must not be empty");
  }
  const request = options.fetch ?? fetch;
  return {
    async evaluate(task, signal): Promise<LlmCallResult> {
      const choices = Object.keys(task.question.criteria);
      const response = await request("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          temperature: 0,
          store: false,
          instructions: LLM_SYSTEM_PROMPT,
          input: JSON.stringify({ evidence: task.evidence, question: task.question }),
          text: {
            format: {
              type: "json_schema",
              name: "scruple_rule_answer",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  choice: { type: "string", enum: choices },
                  rationale: { type: "string" },
                },
                required: ["choice", "rationale"],
                additionalProperties: false,
              },
            },
          },
        }),
        ...(signal === undefined ? {} : { signal }),
      });
      const payload: unknown = await response.json();
      if (!isRecord(payload)) {
        throw new TypeError("OpenAI response must be an object");
      }
      if (!response.ok) {
        throw new Error(`OpenAI HTTP ${response.status}: ${apiError(payload)}`);
      }
      const text = outputText(payload["output"]);
      const answer = parseStructuredAnswer(JSON.parse(text) as unknown, choices);
      const usage = parseUsage(payload["usage"]);
      return {
        model: typeof payload["model"] === "string" ? payload["model"] : options.model,
        answer,
        usage,
      };
    },
  };
};

const outputText = (output: unknown): string => {
  if (!Array.isArray(output)) {
    throw new TypeError("OpenAI response has no output array");
  }
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item["content"])) {
      continue;
    }
    for (const content of item["content"]) {
      if (
        isRecord(content) &&
        content["type"] === "output_text" &&
        typeof content["text"] === "string"
      ) {
        return content["text"];
      }
    }
  }
  throw new Error("OpenAI response has no output_text");
};

const parseUsage = (usage: unknown): { inputTokens: number; outputTokens: number } => {
  if (!isRecord(usage)) {
    throw new Error("OpenAI response has no usage");
  }
  const input = usage["input_tokens"];
  const output = usage["output_tokens"];
  if (typeof input !== "number" || typeof output !== "number") {
    throw new TypeError("OpenAI response usage is invalid");
  }
  return { inputTokens: input, outputTokens: output };
};

const apiError = (payload: Record<string, unknown>): string => {
  if (isRecord(payload["error"]) && typeof payload["error"]["message"] === "string") {
    return payload["error"]["message"];
  }
  return "unknown API error";
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
