import { apiContracts } from "@scruple/api-contracts";
import { asyncRules } from "@scruple/async";
import { comments } from "@scruple/comments";
import type { PluginMap } from "@scruple/core";
import { errors } from "@scruple/errors";
import { observability } from "@scruple/observability";
import { relationalDatabases } from "@scruple/relational-databases";
import { resources } from "@scruple/resources";
import { security } from "@scruple/security";
import { tests } from "@scruple/tests";

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
