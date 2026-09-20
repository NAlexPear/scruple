import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";

import RuleDetail from "./RuleDetail.vue";
import ScrupleMark from "./ScrupleMark.vue";

// oxlint-disable-next-line import/no-unassigned-import -- Vite bundles theme styles from this import.
import "./custom.css";

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "nav-bar-title-before": () => h(ScrupleMark, { class: "nav-mark", compact: true }),
      "nav-bar-content-before": () => h(ScrupleMark, { class: "nav-tail", tailOnly: true }),
    }),
  enhanceApp({ app }) {
    app.component("RuleDetail", RuleDetail);
    app.component("ScrupleMark", ScrupleMark);
  },
};

export default theme;
