import jetBrainsMonoMetrics from "@capsizecss/metrics/jetBrainsMono/regular";
import monaSansMetrics from "@capsizecss/metrics/monaSans/regular";
import pluginCapsize from "tailwindcss-capsize";

export default {
  theme: {
    fontMetrics: {
      // Mona Sans
      sans: monaSansMetrics,
      // JetBrains Mono
      mono: jetBrainsMonoMetrics,
    },
  },

  plugins: [pluginCapsize],
};
