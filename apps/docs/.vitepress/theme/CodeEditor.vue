<script setup lang="ts">
import { highlightText } from "@speed-highlight/core";
import { ref, watch } from "vue";

const props = defineProps<{
  label: string;
  modelValue: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const highlighted = ref("");
const highlightLayer = ref<HTMLPreElement>();
let highlightVersion = 0;

watch(
  () => props.modelValue,
  async (source) => {
    const version = ++highlightVersion;
    const result = await highlightText(source, "ts", false);
    if (version === highlightVersion) {
      highlighted.value = result;
    }
  },
  { immediate: true },
);

const update = (event: Event): void => {
  emit("update:modelValue", (event.target as HTMLTextAreaElement).value);
};

const syncScroll = (event: Event): void => {
  const textarea = event.target as HTMLTextAreaElement;
  if (highlightLayer.value !== undefined) {
    highlightLayer.value.scrollTop = textarea.scrollTop;
    highlightLayer.value.scrollLeft = textarea.scrollLeft;
  }
};
</script>

<template>
  <div class="code-editor">
    <pre ref="highlightLayer" aria-hidden="true"><code v-html="highlighted" /></pre>
    <textarea
      :aria-label="label"
      :value="modelValue"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      @input="update"
      @scroll="syncScroll"
    />
  </div>
</template>

<style scoped>
.code-editor {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.code-editor pre,
.code-editor textarea {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 22px;
  overflow: auto;
  tab-size: 2;
  border: 0;
  outline: 0;
  font: 400 12px/1.75 var(--vp-font-family-mono);
  letter-spacing: normal;
  white-space: pre-wrap;
  overflow-wrap: break-word;
}

.code-editor pre {
  pointer-events: none;
  color: #e2e5dd;
  scrollbar-width: none;
}

.code-editor pre::-webkit-scrollbar {
  display: none;
}

.code-editor textarea {
  z-index: 1;
  resize: none;
  background: transparent;
  caret-color: #edf0e9;
  color: transparent;
  -webkit-text-fill-color: transparent;
}

.code-editor textarea::selection {
  background: rgba(121, 192, 255, 0.3);
}
</style>
