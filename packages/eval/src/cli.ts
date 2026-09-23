import { readFile } from "node:fs/promises";

import type { RuleConfiguration, RuleSeverity } from "@scruple/core";
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

import { createEvalProvider, providerName } from "./provider.js";

const plugins = evaluationPlugins();

const isRuleSeverity = (value: unknown): value is RuleSeverity =>
  value === "off" || value === "warn" || value === "error";

const parseRuleFile = (text: string): Record<string, RuleConfiguration> => {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("--rules must name a JSON object of rule configurations");
  }
  const rules: Record<string, RuleConfiguration> = {};
  for (const [ruleId, entry] of Object.entries(value)) {
    if (isRuleSeverity(entry)) {
      rules[ruleId] = entry;
    } else if (Array.isArray(entry) && entry.length === 2 && isRuleSeverity(entry[0])) {
      rules[ruleId] = [entry[0], entry[1]];
    } else {
      throw new TypeError(`--rules has an invalid configuration for ${ruleId}`);
    }
  }
  return rules;
};

const runModel = async (
  model: string,
  repetitions: number,
  fixtures: readonly EvalFixture[],
  rules: Record<string, RuleConfiguration> | undefined,
): Promise<EvalRunReport[]> => {
  const provider = createEvalProvider(model);
  try {
    return await Promise.all(
      Array.from({ length: repetitions }, (_, index) =>
        runEvaluation({
          fixtures,
          parser: oxcParser(),
          plugins,
          ...(rules === undefined ? {} : { rules }),
          provider,
          providerName: providerName(provider),
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
    const rules =
      options.rules === undefined
        ? undefined
        : parseRuleFile(await readFile(options.rules, "utf8"));
    const runs = (
      await Promise.all(
        options.models.map((model) => runModel(model, options.repetitions, fixtures, rules)),
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
