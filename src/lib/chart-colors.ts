// Chart colors for the dark theme. Categorical slots in fixed order, validated against the app
// surface (#121816) with the dataviz validator: lightness, chroma, colorblind separation and 3:1 contrast pass.
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"] as const;
export const OTHER = "#5b6662"; // neutral for "Outros"
// Sequential blue (one hue, dark → bright = less → more) for the heatmap levels 1–4.
export const HEAT = ["#184f95", "#256abf", "#3987e5", "#86b6ef"] as const;
export const AXIS = "#26322d";
export const TICK = "#9aaba3";
