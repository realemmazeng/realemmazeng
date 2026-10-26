// Pulls analytics for every pin on your Pinterest account, appends a
// snapshot to data/history.csv, and writes assets/art.json for the site's art tab.
//
// Usage: node --env-file=.env track.mjs [days]
//   days: how far back to sum metrics (1-90, default 30)
// Set ART_BOARD in .env to only put pins from that board on the site.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.pinterest.com/v5";
const TOKEN = process.env.PINTEREST_TOKEN;
const METRICS = ["IMPRESSION", "SAVE", "PIN_CLICK", "OUTBOUND_CLICK"];
const days = Math.min(Math.max(Number(process.argv[2]) || 30, 1), 90);

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "data");
const csvPath = join(dataDir, "history.csv");
const artPath = join(here, "..", "..", "assets", "art.json");
const ART_BOARD = process.env.ART_BOARD?.trim().toLowerCase();

if (!TOKEN) {
  console.error("Missing PINTEREST_TOKEN. Put it in tools/pinterest/.env (see .env.example).");
  process.exit(1);
}

async function api(path, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  return res.json();
}

async function listAll(path) {
  const items = [];
  let bookmark;
  do {
    const page = await api(path, { page_size: 100, bookmark });
    items.push(...page.items);
    bookmark = page.bookmark;
  } while (bookmark);
  return items;
}

// biggest reasonable size for the grid; videos only have a cover image
function imageOf(pin) {
  const imgs = pin.media?.images ?? {};
  return imgs["600x"]?.url || imgs["1200x"]?.url || pin.media?.cover_image_url || "";
}

const isoDate = (d) => d.toISOString().slice(0, 10);
const csvCell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;

const end = new Date();
const start = new Date(end - days * 864e5);

const pins = await listAll("/pins");
console.log(`Found ${pins.length} pins. Fetching last ${days} days of analytics...\n`);

const rows = [];
for (const pin of pins) {
  let summary = {};
  try {
    const stats = await api(`/pins/${pin.id}/analytics`, {
      start_date: isoDate(start),
      end_date: isoDate(end),
      metric_types: METRICS.join(","),
    });
    summary = stats.all?.summary_metrics ?? {};
  } catch (err) {
    console.warn(`  skipped ${pin.id}: ${err.message}`);
  }
  rows.push({
    pin_id: pin.id,
    title: pin.title || pin.description?.slice(0, 60) || "(untitled)",
    impressions: summary.IMPRESSION ?? 0,
    saves: summary.SAVE ?? 0,
    pin_clicks: summary.PIN_CLICK ?? 0,
    outbound_clicks: summary.OUTBOUND_CLICK ?? 0,
    board_id: pin.board_id,
    image: imageOf(pin),
  });
}

rows.sort((a, b) => b.impressions - a.impressions);
console.table(rows.map(({ pin_id, board_id, image, ...r }) => r));

if (!existsSync(dataDir)) mkdirSync(dataDir);
const header = "snapshot_date,window_days,pin_id,title,impressions,saves,pin_clicks,outbound_clicks\n";
if (!existsSync(csvPath)) appendFileSync(csvPath, header);
const today = isoDate(end);
appendFileSync(
  csvPath,
  rows
    .map((r) =>
      [today, days, r.pin_id, r.title, r.impressions, r.saves, r.pin_clicks, r.outbound_clicks]
        .map(csvCell)
        .join(",")
    )
    .join("\n") + "\n"
);
console.log(`\nAppended ${rows.length} rows to ${csvPath}`);

// public file for the site: only what's shown on the art tab, never the token
let artRows = rows.filter((r) => r.image);
if (ART_BOARD) {
  const boards = await listAll("/boards");
  const board = boards.find((b) => b.name.trim().toLowerCase() === ART_BOARD);
  if (!board) throw new Error(`No board named "${process.env.ART_BOARD}". Boards: ${boards.map((b) => b.name).join(", ")}`);
  artRows = artRows.filter((r) => r.board_id === board.id);
}
// pieces added by hand (no pinterest id) stay at the front of the grid
let manual = [];
try {
  manual = JSON.parse(readFileSync(artPath, "utf8")).pins.filter((p) => !p.id);
} catch {}
const art = {
  updated: today,
  window_days: days,
  pins: manual.concat(artRows.map((r) => ({
    id: r.pin_id,
    title: r.title,
    image: r.image,
    url: `https://www.pinterest.com/pin/${r.pin_id}/`,
    impressions: r.impressions,
    saves: r.saves,
    clicks: r.pin_clicks + r.outbound_clicks,
  }))),
};
writeFileSync(artPath, JSON.stringify(art, null, 2) + "\n");
console.log(`Wrote ${art.pins.length} pins to ${artPath}`);
