import { defineConfig, type DefaultTheme } from "vitepress";
import llmstxt, { copyOrDownloadAsMarkdownButtons } from "vitepress-plugin-llms";

import { getRule } from "./rule-catalog.js";

const pluginItems: DefaultTheme.SidebarItem[] = [
  { text: "Overview", link: "/plugins/" },
  { text: "API Contracts", link: "/plugins/api-contracts" },
  { text: "Async", link: "/plugins/async" },
  { text: "Comments", link: "/plugins/comments" },
  { text: "Errors", link: "/plugins/errors" },
  { text: "Observability", link: "/plugins/observability" },
  { text: "Relational Databases", link: "/plugins/relational-databases" },
  { text: "Resources", link: "/plugins/resources" },
  { text: "Security", link: "/plugins/security" },
  { text: "Tests", link: "/plugins/tests" },
];

const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: "Getting started",
    items: [
      { text: "Introduction", link: "/guide/introduction" },
      { text: "Quickstart", link: "/guide/quickstart" },
      { text: "Configuration", link: "/guide/configuration" },
      { text: "Agent skills", link: "/guide/agent-skills" },
    ],
  },
  {
    text: "Core concepts",
    items: [
      { text: "How Scruple works", link: "/concepts/how-it-works" },
      { text: "Evidence and decisions", link: "/concepts/evidence-and-decisions" },
    ],
  },
  {
    text: "Custom rules",
    items: [{ text: "Write a plugin", link: "/guide/writing-a-plugin" }],
  },
  {
    text: "Providers",
    collapsed: true,
    items: [
      { text: "Overview", link: "/providers/" },
      { text: "Jev", link: "/providers/jev" },
    ],
  },
  {
    text: "Plugins",
    collapsed: true,
    items: pluginItems,
  },
  {
    text: "Reference",
    items: [
      { text: "CLI", link: "/reference/cli" },
      { text: "Configuration API", link: "/reference/configuration" },
      { text: "Benchmarks", link: "/reference/benchmarks" },
    ],
  },
];

const siteUrl = "https://scruple.dev";
const socialImage = `${siteUrl}/assets/social-card.png`;

const pageUrl = (page: string): string => {
  const path = page.replace(/index\.md$/u, "").replace(/\.md$/u, "");
  return `${siteUrl}/${path}`;
};

export default defineConfig({
  title: "Scruple",
  description: "Make good taste enforceable with named, tested code checks.",
  cleanUrls: true,
  sitemap: { hostname: siteUrl },
  vite: {
    plugins: [
      llmstxt({
        domain: "https://scruple.dev",
        customTemplateVariables: {
          title: "Scruple",
          description:
            "Scruple turns engineering judgment into named, tested code checks that run from the command line.",
          details:
            "Use these docs to install and configure Scruple, choose rules and providers, or build plugins and provider adapters.",
        },
      }),
    ],
    resolve: {
      conditions: ["source", "module", "browser", "development|production"],
    },
    server: {
      allowedHosts: [".onamp.dev"],
    },
  },
  markdown: {
    config(markdown) {
      copyOrDownloadAsMarkdownButtons(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The plugin bundles a second, structurally compatible markdown-it declaration.
        markdown as unknown as Parameters<typeof copyOrDownloadAsMarkdownButtons>[0],
      );
    },
  },
  transformPageData(pageData) {
    const ruleId: unknown = pageData.params?.["rule"];
    if (typeof ruleId !== "string") {
      return {};
    }
    return {
      title: ruleId,
      description: getRule(ruleId)?.summary ?? `Scruple rule ${ruleId}`,
    };
  },
  transformHead({ page, title, description }) {
    const url = pageUrl(page);
    return [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:type", content: "website" }],
      ["meta", { property: "og:site_name", content: "Scruple" }],
      ["meta", { property: "og:locale", content: "en_US" }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:image", content: socialImage }],
      ["meta", { property: "og:image:type", content: "image/png" }],
      ["meta", { property: "og:image:width", content: "1200" }],
      ["meta", { property: "og:image:height", content: "630" }],
      [
        "meta",
        {
          property: "og:image:alt",
          content: "Scruple — make good taste enforceable with named, tested code checks.",
        },
      ],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
      ["meta", { name: "twitter:image", content: socialImage }],
      [
        "meta",
        {
          name: "twitter:image:alt",
          content: "Scruple — make good taste enforceable with named, tested code checks.",
        },
      ],
    ];
  },
  head: [
    ["link", { rel: "icon", href: "/assets/scruple-mark.svg", type: "image/svg+xml" }],
    ["meta", { name: "theme-color", content: "#f4f1e8" }],
  ],
  themeConfig: {
    siteTitle: "scruple",
    nav: [
      { text: "Docs", link: "/guide/introduction" },
      { text: "Plugins", link: "/plugins/" },
      { text: "Write a rule", link: "/guide/writing-a-plugin" },
      { text: "GitHub", link: "https://github.com/NAlexPear/scruple" },
    ],
    search: { provider: "local" },
    sidebar,
    outline: { level: [2, 3], label: "On this page" },
    socialLinks: [{ icon: "github", link: "https://github.com/NAlexPear/scruple" }],
    editLink: {
      pattern: "https://github.com/NAlexPear/scruple/edit/main/apps/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Scruple",
    },
  },
});
