/* oxlint-disable import/max-dependencies -- the evaluation registry intentionally loads every evaluated rule package */
import { apiContracts } from "@scruple/api-contracts";
import { asyncRules } from "@scruple/async";
import { caches } from "@scruple/caches";
import { comments } from "@scruple/comments";
import type { PluginMap } from "@scruple/core";
import { errors } from "@scruple/errors";
import { httpClients } from "@scruple/http-clients";
import { observability } from "@scruple/observability";
import { queues } from "@scruple/queues";
import { relationalDatabases } from "@scruple/relational-databases";
import { resources } from "@scruple/resources";
import { security } from "@scruple/security";
import { tests } from "@scruple/tests";

export const evaluationPlugins = (): PluginMap => {
  return {
    "api-contracts": apiContracts(),
    async: asyncRules(),
    caches: caches(),
    comments: comments(),
    errors: errors(),
    "http-clients": httpClients(),
    observability: observability(),
    queues: queues(),
    "relational-databases": relationalDatabases(),
    resources: resources(),
    security: security(),
    tests: tests(),
  };
};
