import { pathToFileURL } from "node:url";

import type { SourceParser } from "@scruple/core";
import { goParser } from "@scruple/parser-go";
import { pythonParser } from "@scruple/parser-python";
import { rustParser } from "@scruple/parser-rust";
import { sqlParser } from "@scruple/parser-sql";

const cases: readonly [SourceParser, string, string][] = [
  [
    pythonParser(),
    "service.py",
    "def load():\n    try:\n        client.fetch()\n    except ValueError as error:\n        log.error(error)\n        raise\n",
  ],
  [
    goParser(),
    "service.go",
    "package service\nfunc Load() error {\n  if err := fetch(); err != nil { return err }\n  return nil\n}\n",
  ],
  [rustParser(), "service.rs", "fn load() -> Result<(), Error> {\n    fetch()?;\n    Ok(())\n}\n"],
  [
    sqlParser(),
    "service.sql",
    "CREATE FUNCTION load_value(x integer) RETURNS integer AS $$\n  SELECT coalesce(x, 0);\n$$ LANGUAGE SQL;\n",
  ],
];

export interface ParserEvidenceRow {
  parser: string;
  filename: string;
  language: string;
  functions: { name: string | undefined; calls: string[] }[];
  errorHandlers: { binding: string | undefined; calls: string[]; exits: string[] }[];
  hasFacts: boolean;
  hasApiBoundaries: boolean;
  issues: string[];
}

export const inspectParserEvidence = (): Promise<ParserEvidenceRow[]> =>
  Promise.all(
    cases.map(async ([parser, filename, source]) => {
      const document = await parser.parse(filename, source);
      return {
        parser: parser.id,
        filename,
        language: document.language,
        functions: document.functions.map((fn) => ({
          name: fn.name,
          calls: fn.calls.map((call) => call.callee),
        })),
        errorHandlers: document.errorHandlers.map((handler) => ({
          binding: handler.binding,
          calls: handler.calls.map((call) => call.callee),
          exits: handler.exits.map((exit) => exit.kind),
        })),
        hasFacts: document.facts !== undefined,
        hasApiBoundaries: document.apiBoundaries !== undefined,
        issues: document.issues.map((issue) => issue.message),
      };
    }),
  );

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write(`${JSON.stringify(await inspectParserEvidence(), null, 2)}\n`);
}
