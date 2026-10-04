import assert from "node:assert/strict";
import test from "node:test";

import { runScruple, type DecisionProvider, type SourceParser } from "@scruple/core";
import { goParser } from "@scruple/parser-go";
import { pythonParser } from "@scruple/parser-python";
import { rustParser } from "@scruple/parser-rust";
import { sqlParser } from "@scruple/parser-sql";

const provider: DecisionProvider = {
  id: "unused",
  evaluate: () => Promise.reject(new Error("No rules should call the provider")),
};

await test("language parsers advertise stable scopes and owned file patterns", () => {
  const cases: readonly [SourceParser, string, string, string][] = [
    [pythonParser(), "python", "module.PY", "module.ts"],
    [goParser(), "go", "main.GO", "main.rs"],
    [rustParser(), "rust", "lib.RS", "lib.go"],
    [sqlParser(), "sql", "schema.SQL", "schema.py"],
  ];

  for (const [parser, language, supported, unsupported] of cases) {
    assert.equal(parser.id, language);
    assert.deepEqual(parser.languages, [language]);
    assert.equal(parser.supports(supported), true);
    assert.equal(parser.supports(unsupported), false);
    assert.equal(parser.filePatterns.length, 1);
  }
  assert.equal(pythonParser().supports("types.pyi"), true);
});

await test("Python normalizes functions, calls, comments, imports, and except handlers", async () => {
  const source = `import os
from pathlib import Path

async def fetch(path):
    # Explain the retry.
    try:
        return await client.get(path)
    except ValueError as error:
        log.error(error)
        raise

class Store:
    def save(self):
        callback = lambda: nested_call()
        db.commit()
`;
  const document = await pythonParser().parse("service.py", source);

  assert.deepEqual(document.issues, []);
  assert.deepEqual(document.imports, ["import os", "from pathlib import Path"]);
  assert.equal(document.comments[0]?.value, " Explain the retry.");
  assert.equal(document.comments[0]?.enclosingSource?.startsWith("async def fetch"), true);
  assert.deepEqual(
    document.functions.map(({ name, role, async, calls }) => ({
      name,
      role,
      async,
      calls: calls.map((call) => call.callee),
    })),
    [
      { name: "fetch", role: "function", async: true, calls: ["client.get", "log.error"] },
      { name: "save", role: "method", async: false, calls: ["db.commit"] },
      { name: undefined, role: "function", async: false, calls: ["nested_call"] },
    ],
  );
  assert.deepEqual(
    document.errorHandlers.map(({ binding, calls, exits }) => ({
      binding,
      calls: calls.map((call) => call.callee),
      exits: exits.map((exit) => exit.kind),
    })),
    [{ binding: "error", calls: ["log.error"], exits: ["throw"] }],
  );
});

await test("Go normalizes declarations, methods, imports, comments, and calls", async () => {
  const source = `package demo
import (
  "context"
  alias "fmt"
)

// Run starts work.
func Run(ctx context.Context) {
  nested := func() { hidden() }
  alias.Println(ctx)
}

type Store struct{}
func (s *Store) Save() { db.Commit() }
/* package note */
`;
  const document = await goParser().parse("service.go", source);

  assert.deepEqual(document.issues, []);
  assert.deepEqual(document.imports, ['import (\n  "context"\n  alias "fmt"\n)']);
  assert.deepEqual(
    document.comments.map(({ style, value }) => ({ style, value })),
    [
      { style: "line", value: " Run starts work." },
      { style: "block", value: " package note " },
    ],
  );
  assert.deepEqual(
    document.functions.map(({ name, role, calls }) => ({
      name,
      role,
      calls: calls.map((call) => call.callee),
    })),
    [
      { name: "Run", role: "function", calls: ["alias.Println"] },
      { name: undefined, role: "function", calls: ["hidden"] },
      { name: "Save", role: "method", calls: ["db.Commit"] },
    ],
  );
  assert.deepEqual(document.errorHandlers, []);
});

await test("Rust normalizes use declarations, functions, closures, methods, comments, and calls", async () => {
  const source = `use std::fs::File;
/// Loads the file.
async fn load() { client.get().await; }

struct Store;
impl Store {
    fn save(&self) { db.commit(); }
}

fn with_closure() {
    let callback = || nested();
    callback();
}
`;
  const document = await rustParser().parse("service.rs", source);

  assert.deepEqual(document.issues, []);
  assert.deepEqual(document.imports, ["use std::fs::File;"]);
  assert.equal(document.comments[0]?.value, " Loads the file.");
  assert.deepEqual(
    document.functions.map(({ name, role, async, calls }) => ({
      name,
      role,
      async,
      calls: calls.map((call) => call.callee),
    })),
    [
      { name: "load", role: "function", async: true, calls: ["client.get"] },
      { name: "save", role: "method", async: false, calls: ["db.commit"] },
      { name: "with_closure", role: "function", async: false, calls: ["callback"] },
      { name: undefined, role: "function", async: false, calls: ["nested"] },
    ],
  );
  assert.deepEqual(document.errorHandlers, []);
});

await test("SQL normalizes comments and generic CREATE FUNCTION calls", async () => {
  const source = `-- schema helper
/* Keep this generic. */
CREATE FUNCTION add_one(x integer) RETURNS integer AS $$
  SELECT coalesce(x, 0) + 1;
$$ LANGUAGE SQL;
`;
  const document = await sqlParser().parse("schema.sql", source);

  assert.deepEqual(document.issues, []);
  assert.deepEqual(document.imports, []);
  assert.deepEqual(
    document.comments.map(({ style, value }) => ({ style, value })),
    [
      { style: "line", value: " schema helper" },
      { style: "block", value: " Keep this generic. " },
    ],
  );
  assert.deepEqual(
    document.functions.map(({ name, calls }) => ({
      name,
      calls: calls.map((call) => call.callee),
    })),
    [{ name: "add_one", calls: ["coalesce"] }],
  );
  assert.deepEqual(document.errorHandlers, []);
});

await test("Tree-sitter ranges remain valid JavaScript source ranges with Unicode", async () => {
  const source = `package demo
var label = "😀"
// café
`;
  const document = await goParser().parse("unicode.go", source);
  const comment = document.comments[0];

  assert.ok(comment);
  assert.equal(source.slice(comment.range.start, comment.range.end), "// café");
  assert.deepEqual(comment.location.start, { line: 3, column: 1 });
});

await test("syntax recovery is surfaced as parse issues", async () => {
  const documents = await Promise.all([
    pythonParser().parse("broken.py", "def broken(:\n  pass"),
    goParser().parse("broken.go", "package demo\nfunc broken( {"),
    rustParser().parse("broken.rs", "fn broken( {"),
    sqlParser().parse("broken.sql", "@@@"),
  ]);

  for (const document of documents) {
    assert.equal(
      document.issues.some((issue) => issue.severity === "error"),
      true,
    );
    assert.equal(
      document.issues.every((issue) => issue.range !== undefined),
      true,
    );
  }
});

await test("runScruple awaits asynchronous parsers", async () => {
  const result = await runScruple(
    {
      parser: pythonParser(),
      provider,
      plugins: {},
      rules: {},
    },
    [{ filename: "example.py", source: "def ready():\n    return True\n" }],
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.files, 1);
});
