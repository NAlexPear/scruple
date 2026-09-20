import { defineConfig } from "vitepress";

const pluginItems = [
  ["Overview", "/plugins/"],
  ["API Contracts", "/plugins/api-contracts"],
  ["Async", "/plugins/async"],
  ["Comments", "/plugins/comments"],
  ["Errors", "/plugins/errors"],
  ["Observability", "/plugins/observability"],
  ["Relational Databases", "/plugins/relational-databases"],
  ["Resources", "/plugins/resources"],
  ["Security", "/plugins/security"],
  ["Tests", "/plugins/tests"],
].map(([text, link]) => ({ text, link }));

export default defineConfig({
  title: "Scruple",
  description: "Semantic code checks grounded in focused evidence.",
  cleanUrls: true,
  head: [
    [
      "link",
      {
        rel: "icon",
        href: "/assets/scruple-mark.png",
        media: "(prefers-color-scheme: light)",
      },
    ],
    [
      "link",
      {
        rel: "icon",
        href: "/assets/scruple-mark-inverse.png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    ["meta", { name: "theme-color", content: "#f4f1e8" }],
  ],
  themeConfig: {
    logo: {
      light: "/assets/scruple-mark.png",
      dark: "/assets/scruple-mark-inverse.png",
      alt: "Scruple",
    },
    siteTitle: "scruple",
    nav: [
      { text: "Docs", link: "/guide/introduction" },
      { text: "Plugins", link: "/plugins/" },
      { text: "GitHub", link: "https://github.com/NAlexPear/scruple" },
    ],
    search: { provider: "local" },
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Introduction", link: "/guide/introduction" },
          { text: "Quickstart", link: "/guide/quickstart" },
          { text: "Configuration", link: "/guide/configuration" },
          { text: "Write your own plugin", link: "/guide/writing-a-plugin" },
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
        text: "Providers",
        collapsed: true,
        items: [
          { text: "Overview", link: "/providers/" },
          { text: "Jev", link: "/providers/jev" },
          { text: "Laya", link: "/providers/laya" },
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
        ],
      },
    ],
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
