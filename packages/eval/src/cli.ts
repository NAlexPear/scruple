import { readFile } from "node:fs/promises";

import type { DecisionProvider } from "@scruple/core";
import {
  formatEvalRuns,
  hasEvalFailures,
  parseEvalFixtures,
  runEvaluation,
  validateEvalCorpus,
  type EvalFixture,
  type EvalRunReport,
} from "@scruple/eval";
import { EVAL_HELP, parseEvalOptions } from "@scruple/eval/options";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

import { createDeciderProvider } from "./decider-provider.js";
import { createJevProvider } from "./jev-provider.js";

const plugins = evaluationPlugins();

const runModel = async (
  providerName: "jev" | "decider",
  model: string,
  repetitions: number,
  concurrency: number,
  fixtures: readonly EvalFixture[],
  baseURL?: string,
): Promise<EvalRunReport[]> => {
  const provider =
    providerName === "decider"
      ? createDeciderProvider(model, {
          concurrency,
          ...(baseURL === undefined ? {} : { baseURL }),
        })
      : createJevProvider(model, { concurrency });
  try {
    return await runRepetitions(providerName, model, repetitions, concurrency, fixtures, provider);
  } finally {
    await provider.close?.();
  }
};

const runRepetitions = async (
  providerName: "jev" | "decider",
  model: string,
  repetitions: number,
  concurrency: number,
  fixtures: readonly EvalFixture[],
  provider: DecisionProvider,
  index = 0,
): Promise<EvalRunReport[]> => {
  if (index >= repetitions) {
    return [];
  }
  const report = await runEvaluation({
    concurrency,
    fixtures,
    parser: oxcParser(),
    plugins,
    provider,
    providerName,
    requestedModel: model,
    repetition: index + 1,
  });
  return [
    report,
    ...(await runRepetitions(
      providerName,
      model,
      repetitions,
      concurrency,
      fixtures,
      provider,
      index + 1,
    )),
  ];
};

try {
  const options = parseEvalOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(EVAL_HELP);
  } else {
    const rawFixtures: unknown = JSON.parse(
      await readFile(new URL("../../../tests/eval-fixtures.json", import.meta.url), "utf8"),
    );
    const fixtures = parseEvalFixtures(rawFixtures);
    await validateEvalCorpus(fixtures, oxcParser(), plugins);
    const runs = (
      await Promise.all(
        options.models.map((model) =>
          runModel(
            options.provider,
            model,
            options.repetitions,
            options.concurrency,
            fixtures,
            options.baseURL,
          ),
        ),
      )
    ).flat();
    process.stdout.write(
      options.format === "stylish"
        ? formatEvalRuns(runs)
        : `${JSON.stringify({ runs }, null, 2)}\n`,
    );
    if (hasEvalFailures(runs)) {
      process.exitCode = 1;
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`scruple eval: ${message}\n`);
  process.exitCode = 2;
}
