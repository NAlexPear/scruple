import assert from "node:assert/strict";
import test from "node:test";

import type { DecisionAnswer, SemanticRule } from "@scruple/core";
import { oxcParser } from "@scruple/parser-oxc";
import { relationalDatabases } from "@scruple/relational-databases";

const parse = (source: string) => oxcParser().parse("database.ts", source);
const choiceAnswer = (choice: string, probability: number, confidence: number): DecisionAnswer => {
  return {
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: probability },
  };
};

await test("relational databases plugin registers the retained tranche", () => {
  assert.deepEqual(Object.keys(relationalDatabases().rules), [
    "prefer-database-join",
    "no-query-in-loop",
    "require-transaction-scoped-client",
    "require-deterministic-pagination-order",
  ]);
});

await test("database join prefilter requires relational provenance", () => {
  const rule = relationalDatabases().rules["prefer-database-join"]();
  const typeorm = parse(`import type { Repository } from "typeorm";
export async function joined(userRepository: Repository<User>, teamRepository: Repository<Team>) {
  const users = await userRepository.find();
  const teams = await teamRepository.find();
  return users.map((user) => teams.find((team) => team.id === user.teamId));
}`);
  const knex = parse(`import knex from "knex";
export async function joined() {
  const users = await knex("users");
  const teams = await knex("teams");
  return users.map((user) => teams.find((team) => team.id === user.team_id));
}`);
  const mongoose = parse(`import mongoose from "mongoose";
const User = mongoose.model("User", userSchema);
const Team = mongoose.model("Team", teamSchema);
export async function joined() {
  const users = await User.find();
  const teams = await Team.find();
  return users.map((user) => teams.find((team) => team.id === user.teamId));
}`);
  const unrelatedArrays = parse(`import { Client } from "pg";
export function pair(left: string[], right: string[]) {
  const first = left.find(Boolean);
  const second = right.find(Boolean);
  return left.map((value) => [value, first, second]);
}`);

  assert.equal(rule.collect(typeorm).length, 1);
  assert.equal(rule.collect(knex).length, 1);
  assert.equal(rule.collect(mongoose).length, 0);
  assert.equal(rule.collect(unrelatedArrays).length, 0);
});

await test("database join evidence names query sources and does not assume bounded work is safe", () => {
  const rule = relationalDatabases().rules["prefer-database-join"]();
  const candidate = rule.collect(
    parse(`import type { Repository } from "typeorm";
export async function joined(userRepository: Repository<User>, teamRepository: Repository<Team>) {
  const users = await userRepository.find();
  const teams = await teamRepository.find();
  return users.map((user) => teams.find((team) => team.id === user.teamId));
}`),
  )[0];
  assert.ok(candidate);
  const state = JSON.stringify(candidate.state);
  assert.match(state, /"database_sources":\["userRepository","teamRepository"\]/u);
  assert.match(state, /"evidence_boundary":"current_file"/u);
  assert.doesNotMatch(JSON.stringify(candidate.question), /bounded data|intentionally bounded/iu);
});

await test("query-in-loop prefilter handles statement loops and collection callbacks", () => {
  const rule = relationalDatabases().rules["no-query-in-loop"]();
  const statementLoop = parse(`import { db } from "./db.js";
export async function loadPosts() {
  const users = await db.user.findMany();
  for (const user of users) {
    await db.post.findMany({ where: { userId: user.id } });
  }
}`);
  const callbackLoop = parse(`import { db } from "./db.js";
export async function loadPosts(users: User[]) {
  return Promise.all(users.map(async (user) =>
    db.post.findMany({ where: { userId: user.id } })
  ));
}`);
  const bulkQuery = parse(`import { db } from "./db.js";
export async function loadPosts(userIds: string[]) {
  return db.post.findMany({ where: { userId: { in: userIds } } });
}`);
  const queryAfterLoop = parse(`import { db } from "./db.js";
export async function loadPosts(userIds: string[]) {
  for (const userId of userIds) validate(userId);
  return db.post.findMany({ where: { userId: { in: userIds } } });
}`);
  const nonDatabaseLoop = parse(`export async function resolve(values: Promise<string>[]) {
  return Promise.all(values.map(async (value) => value.trim()));
}`);

  assert.equal(rule.collect(statementLoop).length, 1);
  assert.equal(rule.collect(callbackLoop).length, 1);
  assert.equal(rule.collect(bulkQuery).length, 0);
  assert.equal(rule.collect(queryAfterLoop).length, 0);
  assert.equal(rule.collect(nonDatabaseLoop).length, 0);
});

await test("query-in-loop decisions preserve bounded, batched, sequential, and unknown abstention", () => {
  const rule = relationalDatabases().rules["no-query-in-loop"]();
  const candidate = rule.collect(
    parse(`import { db } from "./db.js";
export async function loadPosts(users: User[]) {
  return Promise.all(users.map((user) => db.post.findMany({ where: { userId: user.id } })));
}`),
  )[0];
  assert.ok(candidate);

  for (const choice of [
    "batched_or_bounded",
    "required_sequential",
    "not_per_item_query",
    "insufficient_context",
  ]) {
    assert.equal(rule.diagnose(choiceAnswer(choice, 1, 1), candidate), null, choice);
  }
});

await test("transaction client prefilter finds callback and manual transaction escapes", () => {
  const rule = relationalDatabases().rules["require-transaction-scoped-client"]();
  const prismaEscape = parse(`import { prisma } from "./db.js";
export async function createUser() {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: "Ada" } });
    await prisma.audit.create({ data: { userId: user.id } });
    return user;
  });
}`);
  const prismaScoped = parse(`import { prisma } from "./db.js";
export async function createUser() {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { name: "Ada" } });
    await tx.audit.create({ data: { userId: user.id } });
    return user;
  });
}`);
  const pgEscape = parse(`import { pool } from "./pool.js";
export async function createUser(client: Client) {
  await client.query("BEGIN");
  await client.query("INSERT INTO users(name) VALUES($1)", ["Ada"]);
  await pool.query("INSERT INTO audit(message) VALUES($1)", ["created"]);
  await client.query("COMMIT");
}`);
  const pgScoped = parse(`import type { PoolClient } from "pg";
export async function createUser(client: PoolClient) {
  await client.query("BEGIN");
  await client.query("INSERT INTO users(name) VALUES($1)", ["Ada"]);
  await client.query("COMMIT");
}`);

  assert.equal(rule.collect(prismaEscape).length, 1);
  assert.equal(rule.collect(prismaScoped).length, 0);
  assert.equal(rule.collect(pgEscape).length, 1);
  assert.equal(rule.collect(pgScoped).length, 0);
});

await test("transaction client prefilter abstains when callback identity is unavailable", () => {
  const rule = relationalDatabases().rules["require-transaction-scoped-client"]();
  const document = parse(`import { prisma } from "./db.js";
export async function createUser() {
  return prisma.$transaction(createUserRecords);
}`);

  assert.equal(rule.collect(document).length, 0);
});

await test("pagination prefilter selects unordered ORM and SQL pagination only", () => {
  const rule = relationalDatabases().rules["require-deterministic-pagination-order"]();
  const unorderedPrisma = parse(`import { db } from "./db.js";
export async function page(skip: number) {
  return db.user.findMany({ skip, take: 20 });
}`);
  const orderedPrisma = parse(`import { db } from "./db.js";
export async function page(skip: number) {
  return db.user.findMany({ skip, take: 20, orderBy: { id: "asc" } });
}`);
  const unorderedSql = parse(`import { Client } from "pg";
export async function page(client: Client, offset: number) {
  return client.query("SELECT id FROM users LIMIT $1 OFFSET $2", [20, offset]);
}`);
  const orderedSql = parse(`import { Client } from "pg";
export async function page(client: Client, offset: number) {
  return client.query("SELECT id FROM users ORDER BY id LIMIT $1 OFFSET $2", [20, offset]);
}`);

  assert.equal(rule.collect(unorderedPrisma).length, 1);
  assert.equal(rule.collect(orderedPrisma).length, 0);
  assert.equal(rule.collect(unorderedSql).length, 1);
  assert.equal(rule.collect(orderedSql).length, 0);
});

await test("pagination decisions allow safety caps and uncertainty", () => {
  const rule = relationalDatabases().rules["require-deterministic-pagination-order"]();
  const candidate = rule.collect(
    parse(`import { db } from "./db.js";
export async function recentFailures() {
  return db.job.findMany({ where: { failed: true }, take: 100 });
}`),
  )[0];
  assert.ok(candidate);

  for (const choice of ["unordered_by_design", "not_pagination", "insufficient_context"]) {
    assert.equal(rule.diagnose(choiceAnswer(choice, 1, 1), candidate), null, choice);
  }
});

await test("relational diagnostics require their calibrated choice, probability, and confidence", () => {
  const plugin = relationalDatabases();
  const cases: Array<{
    rule: SemanticRule;
    candidateSource: string;
    finding: string;
    threshold: number;
    minConfidence: number;
  }> = [
    {
      rule: plugin.rules["prefer-database-join"](),
      candidateSource: `import { db } from "./db.js";
export async function joined() {
  const users = await db.user.findMany();
  const teams = await db.team.findMany();
  return users.map((user) => teams.find((team) => team.id === user.teamId));
}`,
      finding: "database_pushdown",
      threshold: 0.85,
      minConfidence: 0.7,
    },
    {
      rule: plugin.rules["no-query-in-loop"](),
      candidateSource: `import { db } from "./db.js";
export async function load(users: User[]) {
  return Promise.all(users.map((user) => db.post.findMany({ where: { userId: user.id } })));
}`,
      finding: "query_in_loop",
      threshold: 0.9,
      minConfidence: 0.7,
    },
    {
      rule: plugin.rules["require-transaction-scoped-client"](),
      candidateSource: `import { prisma } from "./db.js";
export async function save() {
  return prisma.$transaction(async (tx) => {
    await prisma.user.create({ data: {} });
    return tx.audit.create({ data: {} });
  });
}`,
      finding: "escaped_transaction",
      threshold: 0.9,
      minConfidence: 0.75,
    },
    {
      rule: plugin.rules["require-deterministic-pagination-order"](),
      candidateSource: `import { db } from "./db.js";
export async function page(skip: number) {
  return db.user.findMany({ skip, take: 20 });
}`,
      finding: "missing_order",
      threshold: 0.9,
      minConfidence: 0.75,
    },
  ];

  for (const entry of cases) {
    const candidate = entry.rule.collect(parse(entry.candidateSource))[0];
    assert.ok(candidate, entry.finding);
    const answer = choiceAnswer(entry.finding, entry.threshold, entry.minConfidence);
    assert.ok(entry.rule.diagnose(answer, candidate), entry.finding);
    assert.equal(
      entry.rule.diagnose(
        choiceAnswer(entry.finding, entry.threshold - 0.01, entry.minConfidence),
        candidate,
      ),
      null,
    );
    assert.equal(
      entry.rule.diagnose(
        choiceAnswer(entry.finding, entry.threshold, entry.minConfidence - 0.01),
        candidate,
      ),
      null,
    );
    assert.equal(entry.rule.diagnose(choiceAnswer("insufficient_context", 1, 1), candidate), null);
  }
});

await test("relational rules validate probability and pattern options", () => {
  const plugin = relationalDatabases();

  assert.throws(
    () => plugin.rules["no-query-in-loop"]({ threshold: Number.NaN }),
    /threshold must be a finite number between 0 and 1/u,
  );
  assert.throws(
    () => plugin.rules["require-transaction-scoped-client"]({ minConfidence: 1.1 }),
    /minConfidence must be a finite number between 0 and 1/u,
  );
  assert.throws(
    () =>
      Reflect.apply(plugin.rules["prefer-database-join"], undefined, [
        { collectionOperationPatterns: ["map"] },
      ]),
    /collectionOperationPatterns must be an array of regular expressions/u,
  );
});
