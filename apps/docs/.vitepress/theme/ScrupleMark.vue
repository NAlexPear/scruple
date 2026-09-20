<script setup lang="ts">
defineProps<{ compact?: boolean; extended?: boolean }>();
</script>

<template>
  <svg
    class="ScrupleMark"
    :viewBox="compact ? '154 0 140 448' : '0 0 448 448'"
    aria-hidden="true"
    focusable="false"
  >
    <line v-if="extended" x1="224" y1="0" x2="224" y2="68" />
    <use href="/assets/scruple-mark.svg#mark" />
  </svg>
</template>

<style scoped>
.ScrupleMark {
  fill: none;
  stroke: currentcolor;
  stroke-width: var(--scruple-mark-stroke, 10);
  stroke-linecap: square;
  stroke-linejoin: miter;
}
</style>
