#!/usr/bin/env node
// サーブ解析ラボを、DB もサーバーも要らない単体の HTML 1枚に書き出す。
// 出力: out/serve-lab/index.html（Artifact などの静的ホスティングにそのまま置ける）
//
// React は cdnjs の UMD 版（グローバル変数）を読み込み、バンドルには含めない。
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "scripts/serve-lab-standalone");
const outDir = join(root, "out/serve-lab");
const REACT_VERSION = "18.3.1";

// react / react-dom を UMD のグローバルに差し替える
const SHIMS = {
  react: "module.exports = window.React;",
  "react-dom/client": "module.exports = window.ReactDOM;",
  "react/jsx-runtime": `
    const R = window.React;
    const jsx = (type, props, key) => R.createElement(type, key === undefined ? props : { ...props, key });
    module.exports = { jsx, jsxs: jsx, Fragment: R.Fragment };`,
};
const globalReact = {
  name: "global-react",
  setup(b) {
    b.onResolve({ filter: /^(react|react-dom\/client|react\/jsx-runtime)$/ }, (a) => ({
      path: a.path,
      namespace: "global-react",
    }));
    b.onLoad({ filter: /.*/, namespace: "global-react" }, (a) => ({ contents: SHIMS[a.path], loader: "js" }));
  },
};

const js = await build({
  entryPoints: [join(dir, "entry.tsx")],
  bundle: true,
  write: false,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  tsconfig: join(root, "tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [globalReact],
});

const cssPath = join(dir, "styles.css");
const css = await postcss([tailwind({ base: root, optimize: { minify: true } })]).process(readFileSync(cssPath, "utf8"), {
  from: cssPath,
});

const script = js.outputFiles[0].text.replaceAll("</script", "<\\/script");
const html = `<title>サーブ解析ラボ</title>
<meta name="description" content="ラケットの角度・スイング・ラバーを変えて、卓球のサーブの回転と軌道をシミュレーションする。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=JetBrains+Mono:wght@400;700&family=Noto+Sans+JP:wght@400;700&display=swap">
<style>${css.css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT_VERSION}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT_VERSION}/umd/react-dom.production.min.js"></script>
<script>${script}</script>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html);
console.log(`wrote out/serve-lab/index.html (${(html.length / 1024).toFixed(0)} KB)`);
