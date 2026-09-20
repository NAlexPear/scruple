import { rules } from "../.vitepress/rule-catalog.js";

export default {
  paths: () => rules.map((rule) => ({ params: { rule: rule.id } })),
};
