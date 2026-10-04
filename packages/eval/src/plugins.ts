import type { PluginMap, SourceParser } from "@scruple/core";
import { apiContracts } from "@scruple/example-rules/api-contracts";
import { asyncRules } from "@scruple/example-rules/async";
import { comments } from "@scruple/example-rules/comments";
import { errors } from "@scruple/example-rules/errors";
import { observability } from "@scruple/example-rules/observability";
import { relationalDatabases } from "@scruple/example-rules/relational-databases";
import { resources } from "@scruple/example-rules/resources";
import { security } from "@scruple/example-rules/security";
import { tests } from "@scruple/example-rules/tests";
import { goParser } from "@scruple/parser-go";
import { oxcParser } from "@scruple/parser-oxc";
import { pythonParser } from "@scruple/parser-python";
import { rustParser } from "@scruple/parser-rust";
import { sqlParser } from "@scruple/parser-sql";

export const evaluationParsers = (): SourceParser[] => [
  oxcParser(),
  pythonParser(),
  goParser(),
  rustParser(),
  sqlParser(),
];

export const evaluationPlugins = (): PluginMap => {
  return {
    "api-contracts": apiContracts(),
    async: asyncRules(),
    comments: comments(),
    errors: errors(),
    observability: observability(),
    "relational-databases": relationalDatabases(),
    resources: resources(),
    security: security(),
    tests: tests(),
  };
};
