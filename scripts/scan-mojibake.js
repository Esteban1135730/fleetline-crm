const fs = require("fs");
const path = require("path");

const roots = ["apps/web/src", "packages/ui/src", "packages/shared/src", "apps/api/src"];
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".md", ".json"]);

function walk(d, o = []) {
  if (!fs.existsSync(d)) return o;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", "dist", "build"].includes(e.name)) continue;
      walk(f, o);
    } else if (EXT.has(path.extname(e.name))) o.push(f);
  }
  return o;
}

// Broad mojibake / weird-char detector
const re =
  /Ã.|Â.|â.|�|Â´|Â°|Â·|â€|Ã¡|Ã©|Ã­|Ã³|Ãº|Ã±|Ã|Ã‰|Ã|Ã“|Ãš|Ã‘|â†|âœ|âš|â‚¬|Ã¢|Ãƒ|Ã‚|Â |Â´|Â¨|Âª|Âº|Â¿|Â¡/g;

const hits = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const t = fs.readFileSync(file, "utf8");
    const m = [...t.matchAll(re)];
    if (!m.length) continue;
    const samples = new Map();
    for (const x of m) {
      const i = x.index ?? 0;
      const snip = t
        .slice(Math.max(0, i - 14), Math.min(t.length, i + 20))
        .replace(/\s+/g, " ");
      samples.set(snip, (samples.get(snip) || 0) + 1);
    }
    hits.push({
      file,
      count: m.length,
      samples: [...samples.entries()].slice(0, 10),
    });
  }
}

hits.sort((a, b) => b.count - a.count);
console.log("FILES", hits.length, "TOTAL", hits.reduce((s, h) => s + h.count, 0));
for (const h of hits) {
  console.log("\n##", h.count, h.file);
  for (const [s, c] of h.samples) {
    console.log(" ", c, JSON.stringify(s));
  }
}
