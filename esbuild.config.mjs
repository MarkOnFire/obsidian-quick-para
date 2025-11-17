import esbuild from "esbuild";
import process from "process";

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const prod = args.includes("--production");

const context = await esbuild.context({
  entryPoints: ["src/index.js"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*"],
  format: "cjs",
  platform: "node",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod
});

if (watch) {
  await context.watch();
  console.log("Watching for changes...");
} else {
  await context.rebuild();
  await context.dispose();
}
