<template>
  <div class="cosmic-backdrop" :class="{ 'cosmic-backdrop--fixed': fixed }" aria-hidden="true">
    <span class="galaxy"></span>
    <span class="galaxy-stars"></span>
    <span class="starfield starfield--near"></span>
    <span class="starfield starfield--far"></span>
    <span
      v-for="meteor in activeMeteors"
      :key="meteor.id"
      class="meteor"
      :style="{
        '--m-top': meteor.top,
        '--m-left': meteor.left,
        '--m-angle': `${meteor.angle}deg`,
        '--m-length': `${meteor.length}px`,
        '--m-period': meteor.period,
        '--m-delay': meteor.delay
      }"
    ></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Shared cosmic backdrop: milky-way band, twinkling starfields and shooting
// stars. Dark-theme only for the galaxy/meteors; the starfields stay faintly
// visible in light mode. Use `fixed` when the parent has no positioned
// full-height container (e.g. the console layout). Use `subtle` for
// content-dense pages (console) — fewer meteors on longer periods.
const props = withDefaults(defineProps<{ fixed?: boolean; subtle?: boolean }>(), {
  fixed: false,
  subtle: false
})

// Each streak falls top-right → bottom-left along its own angle, on an
// independent period so they never sync.
const meteors = [
  { id: 1, top: '4%', left: '58%', angle: -38, length: 220, period: '5.6s', delay: '0.4s' },
  { id: 2, top: '12%', left: '84%', angle: -43, length: 150, period: '7.2s', delay: '2.2s' },
  { id: 3, top: '20%', left: '70%', angle: -35, length: 260, period: '6.4s', delay: '4.1s' },
  { id: 4, top: '28%', left: '92%', angle: -41, length: 170, period: '8.8s', delay: '1.3s' },
  { id: 5, top: '36%', left: '62%', angle: -37, length: 200, period: '6.8s', delay: '5.6s' },
  { id: 6, top: '45%', left: '80%', angle: -44, length: 140, period: '9.4s', delay: '3.4s' },
  { id: 7, top: '54%', left: '66%', angle: -39, length: 230, period: '5.9s', delay: '6.8s' },
  { id: 8, top: '63%', left: '88%', angle: -36, length: 160, period: '7.6s', delay: '0.9s' },
  { id: 9, top: '72%', left: '56%', angle: -42, length: 190, period: '8.2s', delay: '4.9s' },
  { id: 10, top: '80%', left: '76%', angle: -34, length: 240, period: '6.1s', delay: '7.7s' },
  { id: 11, top: '16%', left: '48%', angle: -40, length: 180, period: '9.8s', delay: '8.5s' },
  { id: 12, top: '90%', left: '84%', angle: -45, length: 130, period: '7.9s', delay: '2.8s' }
] as const

// Sparse variant for the console: 4 streaks, ~2.5x longer periods.
const meteorsSubtle = [
  { id: 1, top: '8%', left: '62%', angle: -38, length: 220, period: '14s', delay: '1.2s' },
  { id: 2, top: '26%', left: '86%', angle: -43, length: 160, period: '19s', delay: '6.5s' },
  { id: 3, top: '52%', left: '72%', angle: -36, length: 200, period: '16s', delay: '10.8s' },
  { id: 4, top: '78%', left: '82%', angle: -41, length: 150, period: '22s', delay: '4.3s' }
] as const

const activeMeteors = computed(() => (props.subtle ? meteorsSubtle : meteors))
</script>

<style scoped>
.cosmic-backdrop {
  --cosmic-faint: #5b6b8c;
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  contain: layout paint style;
}

.cosmic-backdrop--fixed {
  position: fixed;
}

html.dark .cosmic-backdrop {
  --cosmic-faint: #8494b6;
}

/* Milky-way band: a diagonal wash of nebula color with a bright core, plus
   a cluster of pinprick stars along the same axis. Layered radial blooms
   (pink/violet/cyan) sit under the main band so it reads as a glowing
   galaxy rather than a flat stripe. Dark-only, like the meteors. */
.galaxy {
  position: absolute;
  top: -22%;
  left: -18%;
  display: none;
  width: 140%;
  height: 62%;
  background:
    radial-gradient(420px 260px at 28% 44%, rgba(244, 114, 182, 0.12), transparent 70%),
    radial-gradient(540px 300px at 52% 55%, rgba(167, 139, 250, 0.14), transparent 72%),
    radial-gradient(460px 280px at 76% 40%, rgba(56, 189, 248, 0.12), transparent 70%),
    radial-gradient(620px 220px at 52% 50%, rgba(255, 255, 255, 0.1), transparent 72%),
    linear-gradient(112deg, transparent 12%, rgba(147, 197, 253, 0.1) 32%, rgba(216, 180, 254, 0.17) 50%, rgba(249, 168, 212, 0.13) 61%, rgba(125, 211, 252, 0.1) 73%, transparent 88%);
  filter: blur(28px);
  opacity: 1;
  transform: rotate(-22deg);
  animation: galaxy-breathe 18s ease-in-out infinite;
  will-change: opacity;
}

html.dark .galaxy {
  display: block;
}

.galaxy-stars {
  position: absolute;
  inset: 0;
  display: none;
  background-image:
    radial-gradient(1px 1px at 22% 10%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 25% 15%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(2px 2px at 28% 17%, rgba(191, 219, 254, 0.95) 50%, transparent 51%),
    radial-gradient(1px 1px at 31% 22%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 34% 24%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 36% 29%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 39% 27%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(2px 2px at 42% 33%, rgba(249, 168, 212, 0.9) 50%, transparent 51%),
    radial-gradient(1px 1px at 44% 37%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 47% 36%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 49% 42%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(2px 2px at 51% 45%, rgba(255, 255, 255, 0.95) 50%, transparent 51%),
    radial-gradient(1px 1px at 53% 48%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 56% 50%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 58% 44%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 60% 54%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(2px 2px at 62% 56%, rgba(165, 243, 252, 0.9) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 64% 59%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 67% 61%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 69% 65%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 72% 67%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 74% 71%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(2px 2px at 77% 73%, rgba(216, 180, 254, 0.9) 50%, transparent 51%),
    radial-gradient(1px 1px at 80% 77%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 83% 81%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 30% 12%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 41% 23%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 55% 39%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 66% 54%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 71% 74%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 46% 30%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 59% 60%, var(--cosmic-faint) 50%, transparent 51%);
  opacity: 0.75;
  animation: star-twinkle 8.4s ease-in-out infinite;
}

html.dark .galaxy-stars {
  display: block;
}

.starfield {
  position: absolute;
  inset: 0;
}

.starfield--near {
  background-image:
    radial-gradient(1.5px 1.5px at 8% 18%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 16% 62%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 27% 36%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 38% 82%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 47% 9%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 58% 52%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 66% 27%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 74% 71%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 83% 44%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 92% 88%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 96% 12%, var(--cosmic-faint) 50%, transparent 51%);
  opacity: 0.3;
  animation: star-twinkle 5.2s ease-in-out infinite;
}

.starfield--far {
  background-image:
    radial-gradient(1px 1px at 5% 44%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 13% 88%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 23% 14%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 33% 56%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 42% 24%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 52% 90%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 61% 38%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 71% 8%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 79% 60%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 88% 30%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 94% 52%, var(--cosmic-faint) 50%, transparent 51%),
    radial-gradient(1px 1px at 30% 95%, var(--cosmic-faint) 50%, transparent 51%);
  opacity: 0.18;
  animation: star-twinkle 7.4s ease-in-out infinite reverse;
}

html.dark .starfield--near {
  opacity: 0.85;
}

html.dark .starfield--far {
  opacity: 0.45;
}

/* Shooting stars: a bright streak whose own x-axis is rotated into the fall
   direction; the keyframe slides it along that axis and fades it in/out. */
.meteor {
  position: absolute;
  top: var(--m-top);
  left: var(--m-left);
  display: none;
  width: var(--m-length);
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.95), rgba(148, 197, 255, 0.45) 38%, transparent);
  filter: drop-shadow(0 0 5px rgba(147, 197, 253, 0.9));
  opacity: 0;
  transform: rotate(var(--m-angle)) translateX(0);
  animation: meteor-fall var(--m-period) linear infinite;
  animation-delay: var(--m-delay);
  will-change: transform, opacity;
}

html.dark .meteor {
  display: block;
}

.meteor::after {
  position: absolute;
  top: 50%;
  left: -1px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 8px 2px rgba(255, 255, 255, 0.75), 0 0 18px 6px rgba(56, 189, 248, 0.45);
  content: '';
  transform: translateY(-50%);
}

@keyframes meteor-fall {
  0% {
    opacity: 0;
    transform: rotate(var(--m-angle)) translateX(0);
  }
  4% {
    opacity: 1;
  }
  14% {
    opacity: 0;
    transform: rotate(var(--m-angle)) translateX(calc(-1 * var(--m-length) - 420px));
  }
  100% {
    opacity: 0;
    transform: rotate(var(--m-angle)) translateX(calc(-1 * var(--m-length) - 420px));
  }
}

@keyframes star-twinkle {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

/* The galaxy band barely moves — just a slow, shallow opacity swell so it
   feels alive without ever drawing the eye. */
@keyframes galaxy-breathe {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
</style>
