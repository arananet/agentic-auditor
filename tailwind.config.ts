import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { fontFamily: { mono: ["var(--font-space-mono)", "monospace"] } } },
  plugins: [],
};
export default config;
