import { readFile } from "node:fs/promises";

import { noUselessCommentsPlugin } from "@scruple/comments";
import type { DecisionProvider, SemanticPlugin } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { jevProvider } from "@scruple/provider-jev";
import { layaProvider, type LayaModel } from "@scruple/provider-laya";
import { preferDatabaseJoinPlugin } from "@scruple/relational-databases";
import { noVacuousTestsPlugin } from "@scruple/tests";

import {
  hasEvalFailures,
  parseEvalFixtures,
  runEvaluation,
  type EvalFixture,
  type EvalRunReport,
} from "./index.js";
import { EVAL_HELP, parseEvalOptions, type EvalProviderSpec } from "./options.js";

const plugins: SemanticPlugin[] = [
  noUselessCommentsPlugin(),
  noVacuousTestsPlugin(),
  preferDatabaseJoinPlugin(),
];

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

function createProvider(spec: EvalProviderSpec): DecisionProvider {
  if (spec.provider === "jev") {
    return jevProvider({ model: spec.model });
  }
  if (!isLayaModel(spec.model)) {
    throw new Error(`Unsupported Laya model: ${spec.model}`);
  }
  return layaProvider({ model: spec.model });
}

async function runSpec(
  spec: EvalProviderSpec,
  repetitions: number,
  fixtures: readonly EvalFixture[],
): Promise<EvalRunReport[]> {
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
}

function isLayaModel(model: string): model is LayaModel {
  return ["auto", "english", "multilingual", "typed-decisions"].includes(model);
}
