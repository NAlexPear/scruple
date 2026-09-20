import { readFile } from "node:fs/promises";

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

import { createJevProvider } from "./jev-provider.js";

const plugins = evaluationPlugins();

const runModel = async (
  model: string,
  repetitions: number,
  fixtures: readonly EvalFixture[],
): Promise<EvalRunReport[]> => {
  const provider = createJevProvider(model);
  try {
    return await Promise.all(
      Array.from({ length: repetitions }, (_, index) =>
        runEvaluation({
          fixtures,
          parser: oxcParser(),
          plugins,
          provider,
          providerName: "jev",
          requestedModel: model,
          repetition: index + 1,
        }),
      ),
    );
  } finally {
    await provider.close?.();
  }
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
        options.models.map((model) => runModel(model, options.repetitions, fixtures)),
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
