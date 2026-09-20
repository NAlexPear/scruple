import { readFile } from "node:fs/promises";

import type { DecisionProvider } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";
import { layaProvider, type LayaModel } from "@scruple/provider-laya";

import {
  hasEvalFailures,
  parseEvalFixtures,
  runEvaluation,
  type EvalFixture,
  type EvalRunReport,
} from "./index.js";
import { EVAL_HELP, parseEvalOptions, type EvalProviderSpec } from "./options.js";
import { evaluationPlugins } from "./plugins.js";

const plugins = evaluationPlugins();

try {
  const options = parseEvalOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(EVAL_HELP);
  } else {
    const rawFixtures: unknown = JSON.parse(
      await readFile(new URL("../../../tests/eval-fixtures.json", import.meta.url), "utf8"),
    );
    const fixtures = parseEvalFixtures(rawFixtures);
    const runs = (
      await Promise.all(options.specs.map((spec) => runSpec(spec, options.repetitions, fixtures)))
    ).flat();
    process.stdout.write(`${JSON.stringify({ runs }, null, 2)}\n`);
    if (hasEvalFailures(runs)) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`scruple eval: ${message}\n`);
  process.exitCode = 2;
}

const createProvider = (spec: EvalProviderSpec): DecisionProvider => {
  if (spec.provider === "jev") {
    const apiKey = process.env["TYPESAFE_API_KEY"];
    if (apiKey === undefined || apiKey.length === 0) {
      throw new Error("TYPESAFE_API_KEY is required for Jev evaluations");
    }
    return jevProvider({ apiKey, model: spec.model });
  }
  if (!isLayaModel(spec.model)) {
    throw new Error(`Unsupported Laya model: ${spec.model}`);
  }
  return layaProvider({ model: spec.model });
};

const runSpec = async (
  spec: EvalProviderSpec,
  repetitions: number,
  fixtures: readonly EvalFixture[],
): Promise<EvalRunReport[]> => {
  const provider = createProvider(spec);
  try {
    return await Promise.all(
      Array.from({ length: repetitions }, (_, index) =>
        runEvaluation({
          fixtures,
          parser: oxcParser(),
          plugins,
          provider,
          providerName: spec.provider,
          requestedModel: spec.model,
          repetition: index + 1,
        }),
      ),
    );
  } finally {
    await provider.close?.();
  }
};

const isLayaModel = (model: string): model is LayaModel => {
  return ["auto", "english", "multilingual", "typed-decisions"].includes(model);
};
