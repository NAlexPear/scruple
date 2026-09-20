import { readFile } from "node:fs/promises";

import {
  hasEvalFailures,
  parseEvalFixtures,
  runEvaluation,
  validateEvalCorpus,
  type EvalFixture,
  type EvalRunReport,
} from "@scruple/eval";
import { EVAL_HELP, parseEvalOptions, type EvalProviderSpec } from "@scruple/eval/options";
import { evaluationPlugins } from "@scruple/eval/plugins";
import { oxcParser } from "@scruple/parser-oxc";

import { createLiveProvider } from "./live-provider.js";

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
    validateEvalCorpus(fixtures, oxcParser(), plugins);
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

const runSpec = async (
  spec: EvalProviderSpec,
  repetitions: number,
  fixtures: readonly EvalFixture[],
): Promise<EvalRunReport[]> => {
  const provider = createLiveProvider(spec, {
    ...(process.env["LAYA_DEVICE"] === undefined ? {} : { layaDevice: process.env["LAYA_DEVICE"] }),
    ...(process.env["LAYA_PYTHON"] === undefined ? {} : { layaPython: process.env["LAYA_PYTHON"] }),
  });
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
