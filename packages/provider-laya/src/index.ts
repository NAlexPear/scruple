import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

import type {
  DecisionAnswer,
  DecisionProvider,
  DecisionRequest,
  DecisionResponse,
} from "@scruple/core";

export type LayaModel = "auto" | "english" | "multilingual" | "typed-decisions";

export interface LayaProviderOptions {
  python?: string;
  model?: LayaModel;
  device?: string;
  preload?: boolean;
  timeoutMs?: number;
}

type NormalizedLayaProviderOptions = Required<
  Pick<LayaProviderOptions, "python" | "model" | "preload" | "timeoutMs">
> &
  Pick<LayaProviderOptions, "device">;

interface PendingRequest {
  resolve(value: DecisionResponse): void;
  reject(reason: Error): void;
  timer: NodeJS.Timeout;
  removeAbortListener(): void;
}

interface BridgeMessage {
  id: number;
  ok: boolean;
  result?: {
    model?: string;
    answers?: Record<string, DecisionAnswer>;
    usage?: { input_tokens?: number; output_tokens?: number };
    routing?: { model?: string };
  };
  error?: string;
}

export const layaProvider = (options: LayaProviderOptions = {}): DecisionProvider => {
  const bridge = new LayaBridge(options);
  const model = options.model ?? "auto";
  return {
    id: `laya:${model}`,
    evaluate: (request, signal) => bridge.evaluate(request, signal),
    close: () => {
      bridge.close();
    },
  };
};

class LayaBridge {
  readonly #options: NormalizedLayaProviderOptions;
  readonly #pending = new Map<number, PendingRequest>();
  #process: ChildProcessWithoutNullStreams | undefined;
  #lines: ReadlineInterface | undefined;
  #nextId = 1;
  #stderr = "";

  constructor(options: LayaProviderOptions) {
    const normalized: NormalizedLayaProviderOptions = {
      python: options.python ?? "python3",
      model: options.model ?? "auto",
      preload: options.preload ?? true,
      timeoutMs: options.timeoutMs ?? 30_000,
    };
    if (options.device !== undefined) {
      normalized.device = options.device;
    }
    this.#options = normalized;
  }

  evaluate(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse> {
    if (signal?.aborted === true) {
      return Promise.reject(new Error("Laya evaluation was aborted"));
    }
    const process = this.#start();
    const id = this.#nextId++;

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.#settle(id);
        reject(new Error("Laya evaluation was aborted"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      const timer = setTimeout(() => {
        this.#settle(id);
        reject(new Error(`Laya evaluation timed out after ${this.#options.timeoutMs}ms`));
      }, this.#options.timeoutMs);

      this.#pending.set(id, {
        resolve,
        reject,
        timer,
        removeAbortListener: () => signal?.removeEventListener("abort", onAbort),
      });

      process.stdin.write(`${JSON.stringify({ id, ...request })}\n`, (error) => {
        if (!error) {
          return;
        }
        this.#settle(id);
        reject(new Error(`Could not send request to Laya: ${error.message}`));
      });
    });
  }

  close(): void {
    this.#lines?.close();
    this.#process?.kill();
    this.#process = undefined;
    this.#rejectAll(new Error("Laya provider closed"));
  }

  #start(): ChildProcessWithoutNullStreams {
    if (this.#process && !this.#process.killed) {
      return this.#process;
    }

    const configuration: Record<string, boolean | string> = {
      model: this.#options.model,
      preload: this.#options.preload,
    };
    if (this.#options.device !== undefined) {
      configuration["device"] = this.#options.device;
    }
    const child = spawn(
      this.#options.python,
      ["-u", "-c", PYTHON_BRIDGE, JSON.stringify(configuration)],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.#process = child;
    this.#stderr = "";

    this.#lines = createInterface({ input: child.stdout });
    this.#lines.on("line", (line) => {
      this.#handleLine(line);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.#stderr = `${this.#stderr}${chunk.toString()}`.slice(-4_000);
    });
    child.on("error", (error) => {
      this.#rejectAll(new Error(`Could not start Laya: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      this.#process = undefined;
      const detail = this.#stderr.trim();
      this.#rejectAll(
        new Error(
          `Laya process exited (${signal ?? code ?? "unknown"})${detail ? `: ${detail}` : ""}`,
        ),
      );
    });
    return child;
  }

  #handleLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.#rejectAll(new Error("Laya returned malformed JSON"));
      return;
    }
    if (!isBridgeMessage(parsed)) {
      this.#rejectAll(new Error("Laya returned an invalid response"));
      return;
    }
    const message = parsed;

    const pending = this.#pending.get(message.id);
    if (!pending) {
      return;
    }
    this.#settle(message.id);

    if (!message.ok || !message.result?.answers) {
      pending.reject(new Error(message.error ?? "Laya returned an invalid response"));
      return;
    }

    pending.resolve({
      model: message.result.model ?? message.result.routing?.model ?? `laya:${this.#options.model}`,
      answers: message.result.answers,
      usage: {
        inputTokens: message.result.usage?.input_tokens ?? 0,
        outputTokens: message.result.usage?.output_tokens ?? 0,
      },
    });
  }

  #settle(id: number): void {
    const pending = this.#pending.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pending.removeAbortListener();
    this.#pending.delete(id);
  }

  #rejectAll(error: Error): void {
    for (const [id, pending] of this.#pending) {
      this.#settle(id);
      pending.reject(error);
    }
  }
}

const PYTHON_BRIDGE = String.raw`
import json
import sys

from laya import Router

config = json.loads(sys.argv[1])
kwargs = {"preload": config.get("preload", True)}
if config.get("device"):
    kwargs["device"] = config["device"]
router = Router(**kwargs)

for line in sys.stdin:
    try:
        request = json.loads(line)
        predict_kwargs = {}
        if config.get("model") != "auto":
            predict_kwargs["model"] = config["model"]
        result = router.predict(request["state"], request["questions"], **predict_kwargs)
        print(json.dumps({"id": request["id"], "ok": True, "result": result}), flush=True)
    except Exception as error:
        request_id = request.get("id", -1) if "request" in locals() else -1
        print(json.dumps({"id": request_id, "ok": False, "error": str(error)}), flush=True)
`;

const isBridgeMessage = (value: unknown): value is BridgeMessage => {
  if (!isRecord(value) || typeof value["id"] !== "number" || typeof value["ok"] !== "boolean") {
    return false;
  }
  if (value["error"] !== undefined && typeof value["error"] !== "string") {
    return false;
  }
  const result = value["result"];
  if (result === undefined) {
    return true;
  }
  if (!isRecord(result)) {
    return false;
  }
  const answers = result["answers"];
  return (
    (result["model"] === undefined || typeof result["model"] === "string") &&
    (answers === undefined ||
      (isRecord(answers) && Object.values(answers).every((answer) => isDecisionAnswer(answer)))) &&
    isUsage(result["usage"]) &&
    isRouting(result["routing"])
  );
};

const isDecisionAnswer = (value: unknown): value is DecisionAnswer => {
  if (!isRecord(value) || typeof value["type"] !== "string") {
    return false;
  }
  if (value["type"] === "noul") {
    return typeof value["noul"] === "number";
  }
  if (value["type"] === "choice") {
    return (
      typeof value["choice"] === "string" &&
      typeof value["confidence"] === "number" &&
      isNumberRecord(value["probabilities"])
    );
  }
  return (
    value["type"] === "score" &&
    typeof value["score"] === "number" &&
    typeof value["confidence"] === "number" &&
    isNumberRecord(value["probabilities"]) &&
    isRecord(value["legend"])
  );
};

const isUsage = (value: unknown): boolean => {
  return (
    value === undefined ||
    (isRecord(value) &&
      (value["input_tokens"] === undefined || typeof value["input_tokens"] === "number") &&
      (value["output_tokens"] === undefined || typeof value["output_tokens"] === "number"))
  );
};

const isRouting = (value: unknown): boolean => {
  return (
    value === undefined ||
    (isRecord(value) && (value["model"] === undefined || typeof value["model"] === "string"))
  );
};

const isNumberRecord = (value: unknown): value is Record<string, number> => {
  return isRecord(value) && Object.values(value).every((item) => typeof item === "number");
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};
