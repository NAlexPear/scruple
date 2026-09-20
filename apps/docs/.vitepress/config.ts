import { defineConfig, type DefaultTheme } from "vitepress";

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
    items: [{ text: "Write your own plugin", link: "/guide/writing-a-plugin" }],
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

export default defineConfig({
  title: "Scruple",
  description: "Make good taste enforceable with named, tested code checks.",
  cleanUrls: true,
  vite: {
    server: {
      allowedHosts: [".onamp.dev"],
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
