interface SuppressionComment {
  filename: string;
  value: string;
  range: { start: number; end: number };
  location: { start: { line: number }; end: { line: number } };
}

interface SuppressionTarget {
  filename: string;
  range: { start: number; end: number };
  location: { start: { line: number } };
}

type SuppressionCommand = "disable" | "enable" | "disable-line" | "disable-next-line";

interface SuppressionDirective {
  command: SuppressionCommand;
  rules?: ReadonlySet<string>;
  sourceRange: { start: number; end: number };
  offset: number;
  line: number;
}

export type SuppressionFilter = (ruleId: string, target: SuppressionTarget) => boolean;

export const createSuppressionFilter = (
  filename: string,
  comments: readonly SuppressionComment[],
): SuppressionFilter => {
  const directives = comments
    .map((comment) => parseDirective(comment))
    .filter((directive): directive is SuppressionDirective => directive !== undefined)
    .toSorted((left, right) => left.offset - right.offset);
  const lineDirectives = directives.filter(
    (directive) =>
      directive.command === "disable-line" || directive.command === "disable-next-line",
  );
  const rangeDirectives = directives.filter(
    (directive) => directive.command === "disable" || directive.command === "enable",
  );

  return (ruleId, target) => {
    if (target.filename !== filename) {
      return false;
    }

    const targetLine = target.location.start.line;
    if (
      lineDirectives.some(
        (directive) =>
          !isTargetDirective(directive, target) &&
          directive.line === targetLine &&
          appliesToRule(directive, ruleId),
      )
    ) {
      return true;
    }

    let allDisabled = false;
    let ruleDisabled: boolean | undefined;
    for (const directive of rangeDirectives) {
      if (directive.offset > target.range.start) {
        break;
      }
      const disabled = directive.command === "disable";
      if (directive.rules === undefined) {
        allDisabled = disabled;
        ruleDisabled = undefined;
      } else if (directive.rules.has(ruleId)) {
        ruleDisabled = disabled;
      }
    }
    return ruleDisabled ?? allDisabled;
  };
};

const parseDirective = (comment: SuppressionComment): SuppressionDirective | undefined => {
  const match =
    /^\s*\*?\s*scruple-(disable-next-line|disable-line|disable|enable)(?=\s|$)([^\r\n]*)/u.exec(
      comment.value,
    );
  if (!match) {
    return undefined;
  }

  const command = match[1];
  if (!isSuppressionCommand(command)) {
    return undefined;
  }
  const remainder = match[2]?.trim() ?? "";
  const justificationStart = remainder.search(/(?:^|\s)--(?:\s|$)/u);
  const selector = (
    justificationStart === -1 ? remainder : remainder.slice(0, justificationStart)
  ).trim();
  const ruleIds = selector.split(/[\s,]+/u).filter((ruleId) => ruleId.length > 0);
  const rules = ruleIds.length === 0 ? undefined : new Set(ruleIds);
  const line =
    command === "disable-next-line" ? comment.location.end.line + 1 : comment.location.start.line;

  return {
    command,
    ...(rules === undefined ? {} : { rules }),
    sourceRange: comment.range,
    offset: comment.range.end,
    line,
  };
};

const isTargetDirective = (directive: SuppressionDirective, target: SuppressionTarget): boolean => {
  return (
    directive.sourceRange.start === target.range.start &&
    directive.sourceRange.end === target.range.end
  );
};

const appliesToRule = (directive: SuppressionDirective, ruleId: string): boolean => {
  return directive.rules === undefined || directive.rules.has(ruleId);
};

const isSuppressionCommand = (value: string | undefined): value is SuppressionCommand => {
  return (
    value === "disable" ||
    value === "enable" ||
    value === "disable-line" ||
    value === "disable-next-line"
  );
};
