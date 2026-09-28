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
import { EVAL_HELP, parseEvalOptions, type EvalOptions } from "@scruple/eval/options";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

import { evalProvider } from "./provider.js";

const plugins = evaluationPlugins();

const runModel = async (
  model: string,
  options: EvalOptions,
  fixtures: readonly EvalFixture[],
): Promise<EvalRunReport[]> => {
  const provider = evalProvider(options.provider).create({
    model,
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
    concurrency: options.concurrency,
  });
  try {
    return await runRepetitions(model, options, fixtures, provider);
  } finally {
    await provider.close?.();
  }
};

const runRepetitions = async (
  model: string,
  options: EvalOptions,
  fixtures: readonly EvalFixture[],
  provider: DecisionProvider,
  index = 0,
): Promise<EvalRunReport[]> => {
  if (index >= options.repetitions) {
    return [];
  }
  const report = await runEvaluation({
    concurrency: options.concurrency,
    fixtures,
    parser: oxcParser(),
    plugins,
    provider,
    providerName: options.provider,
    requestedModel: model,
    repetition: index + 1,
  });
  return [report, ...(await runRepetitions(model, options, fixtures, provider, index + 1))];
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
      await Promise.all(options.models.map((model) => runModel(model, options, fixtures)))
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
