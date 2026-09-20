<script setup lang="ts">
import { highlightText, type ShjLanguage } from "@speed-highlight/core";
import { ref, watch } from "vue";

const props = defineProps<{
  language: ShjLanguage;
  source: string;
}>();

const highlighted = ref("");
let highlightVersion = 0;

watch(
  () => [props.source, props.language] as const,
  async ([source, language]) => {
    const version = ++highlightVersion;
    const result = await highlightText(source, language, false);
    if (version === highlightVersion) {
      highlighted.value = result;
    }
  },
  { immediate: true },
);
</script>

<template>
  <pre class="highlighted-code"><code v-html="highlighted" /></pre>
</template>
