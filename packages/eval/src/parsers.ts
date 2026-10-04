import type { SourceParser } from "@scruple/core";
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
