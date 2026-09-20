import { rules } from "../.vitepress/rule-catalog.js";

export default {
  paths: () =>
    rules.map((rule) => ({
      params: {
        rule: rule.id,
        summary: rule.summary,
        explanation: rule.explanation,
        category: rule.category,
        tags: rule.tags.join(", "),
        packageName: rule.packageName,
        defaultThreshold: String(rule.defaultThreshold ?? "plugin default"),
        minConfidence: String(rule.minConfidence ?? "plugin default"),
        incorrectExample: `\`\`\`ts\n${rule.incorrect}\n\`\`\``,
        correctExample: `\`\`\`ts\n${rule.correct}\n\`\`\``,
      },
    })),
};
