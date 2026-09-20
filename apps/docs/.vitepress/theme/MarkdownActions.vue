<script setup lang="ts">
import { useCopyOrDownloadAsMarkdownButtons } from "vitepress-plugin-llms/vitepress-components";

const { copied, copyAsMarkdown, downloadMarkdown, viewAsMarkdown } =
  useCopyOrDownloadAsMarkdownButtons();
</script>

<template>
  <div class="markdown-actions" aria-label="Page Markdown actions">
    <button class="markdown-action-primary" type="button" @click="copyAsMarkdown">
      {{ copied ? "Copied" : "Copy page" }}
    </button>
    <button type="button" @click="viewAsMarkdown">View Markdown</button>
    <button type="button" @click="downloadMarkdown">Download .md</button>
  </div>
</template>

<style scoped>
.markdown-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 16px 0 32px;
}

.markdown-actions button {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  font: 500 11px/1 var(--vp-font-family-mono);
  cursor: pointer;
}

.markdown-actions button:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.markdown-actions .markdown-action-primary {
  border-color: var(--vp-c-text-1);
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
}
</style>
