import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const WEB = "apps/web/**/*.{js,jsx,mjs,ts,tsx}";

export default defineConfig([
  globalIgnores(["**/.next/**", "**/.turbo/**", "apps/api/drizzle/**", "**/next-env.d.ts"]),
  // typescript-eslint recommended, for every package.
  ...nextTs,
  {
    rules: {
      // `const { id, ...rest } = row` is how we drop server-owned fields.
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    },
  },
  // The React / Next rules only apply to the web app.
  ...nextVitals.map((c) => ({ ...c, files: [WEB] })),
  {
    files: [WEB],
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      // "AUSPEX // NAME": `//` is the cogitator separator in UI text, not a stray comment.
      "react/jsx-no-comment-textnodes": "off",
      // Plain <a> to the lobby is deliberate: a full load drops the table socket and nothing prefetches.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    // Server components: the try/catch guards the api fetch, and the JSX returned from it is a status screen.
    files: ["apps/web/app/**/page.tsx"],
    rules: { "react-hooks/error-boundaries": "off" },
  },
  // Last, so formatting rules never fight Prettier.
  prettier,
]);
