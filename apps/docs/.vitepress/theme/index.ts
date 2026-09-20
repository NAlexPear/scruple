import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { h } from "vue";

import HeroExamples from "./HeroExamples.vue";
import ProviderOptions from "./ProviderOptions.vue";
import RuleDetail from "./RuleDetail.vue";
import ScrupleMark from "./ScrupleMark.vue";

// oxlint-disable-next-line import/no-unassigned-import -- Vite bundles theme styles from this import.
import "./custom.css";

const theme: Theme = {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "nav-bar-title-before": () => h(ScrupleMark, { class: "nav-mark", compact: true }),
    }),
  enhanceApp({ app }) {
    app.component("HeroExamples", HeroExamples);
    app.component("ProviderOptions", ProviderOptions);
    app.component("RuleDetail", RuleDetail);
    app.component("ScrupleMark", ScrupleMark);
  },
};

export default theme;
