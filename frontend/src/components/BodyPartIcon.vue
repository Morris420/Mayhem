<script setup>
// A tiny figure with the trained body part lit up. Hand-drawn SVG, no icon library.
defineProps({ part: { type: String, required: true } })

const highlights = {
  chest: '<rect x="8.6" y="7.6" width="6.8" height="3.6" rx="1"/>',
  back: '<rect x="8.6" y="7.6" width="6.8" height="6.2" rx="1"/><path d="M12 7.8v5.8" stroke="#0b0e14" stroke-width="0.9"/>',
  shoulders: '<circle cx="7.6" cy="8.3" r="2.1"/><circle cx="16.4" cy="8.3" r="2.1"/>',
  arms: '<rect x="4.3" y="7.7" width="2.6" height="8" rx="1.2"/><rect x="17.1" y="7.7" width="2.6" height="8" rx="1.2"/>',
  legs: '<rect x="8.6" y="16.6" width="3" height="5.8" rx="1.2"/><rect x="12.4" y="16.6" width="3" height="5.8" rx="1.2"/>',
  core: '<rect x="9.2" y="11.4" width="5.6" height="4.4" rx="1"/>',
}
</script>

<template>
  <svg v-if="part === 'cardio'" viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 20.5s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 8 2.3c0 5.6-8 10.2-8 10.2z" fill="currentColor" fill-opacity="0.9" stroke="none" />
    <path d="M5 12.5h3.5l1.5-3 2.5 6 1.7-3H19" stroke="#0b0e14" stroke-width="1.3" />
  </svg>
  <svg v-else viewBox="0 0 24 24" aria-hidden="true">
    <g fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-opacity="0.45" stroke-width="0.8">
      <circle cx="12" cy="3.9" r="2.2" />
      <rect x="8" y="7" width="8" height="9.2" rx="2" />
      <rect x="4.3" y="7.7" width="2.6" height="8" rx="1.2" />
      <rect x="17.1" y="7.7" width="2.6" height="8" rx="1.2" />
      <rect x="8.6" y="16.6" width="3" height="5.8" rx="1.2" />
      <rect x="12.4" y="16.6" width="3" height="5.8" rx="1.2" />
    </g>
    <g fill="currentColor" v-html="highlights[part]"></g>
  </svg>
</template>
