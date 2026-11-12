// Builds assets/languages-light.svg and assets/languages-dark.svg from the public, non-fork repositories of USER
// that were pushed to in the last YEARS years.
// Usage: GITHUB_TOKEN=... node scripts/languages.mjs
import { writeFileSync } from "node:fs";

const USER = process.env.GITHUB_USER ?? "lucastafer";
const HIDE = new Set(["HTML", "CSS", "EJS", "SCSS", "Dockerfile", "Shell"]);
const YEARS = 3;
const since = new Date();
since.setFullYear(since.getFullYear() - YEARS);
const MAX = 8;
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");

const query = `query($login: String!, $after: String) {
  user(login: $login) {
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      pageInfo { hasNextPage endCursor }
      nodes { pushedAt languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name color } } } }
    }
  }
}`;

const totals = new Map();
let after = null;
do {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "profile-languages" },
    body: JSON.stringify({ query, variables: { login: USER, after } }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body));
  const page = body.data.user.repositories;
  for (const repo of page.nodes) {
    if (new Date(repo.pushedAt) < since) continue;
    for (const { size, node } of repo.languages.edges) {
      if (HIDE.has(node.name)) continue;
      const entry = totals.get(node.name) ?? { name: node.name, color: node.color ?? "#8b949e", size: 0 };
      entry.size += size;
      totals.set(node.name, entry);
    }
  }
  after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
} while (after);

const languages = [...totals.values()].sort((a, b) => b.size - a.size).slice(0, MAX);
const sum = languages.reduce((total, language) => total + language.size, 0);
if (!sum) throw new Error("No language data returned");

const escape = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const width = 460;
const padding = 20;
const barWidth = width - padding * 2;
const rows = Math.ceil(languages.length / 2);
const height = 86 + rows * 26;

let x = padding;
const segments = languages.map((language) => {
  const w = (language.size / sum) * barWidth;
  const rect = `<rect x="${x.toFixed(2)}" y="48" width="${w.toFixed(2)}" height="10" fill="${language.color}"/>`;
  x += w;
  return rect;
});
const legend = languages.map((language, index) => {
  const lx = padding + (index % 2) * (barWidth / 2);
  const ly = 86 + Math.floor(index / 2) * 26;
  const percent = ((language.size / sum) * 100).toFixed(1);
  return `<circle cx="${lx + 6}" cy="${ly - 4}" r="6" fill="${language.color}"/><text x="${lx + 20}" y="${ly}" class="label">${escape(language.name)} <tspan class="muted">${percent}%</tspan></text>`;
});

const themes = {
  light: { text: "#1f2328", muted: "#656d76", frame: "#d0d7de" },
  dark: { text: "#e6edf3", muted: "#8b949e", frame: "#30363d" },
};
for (const [name, theme] of Object.entries(themes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Most used languages">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
    .title { font-size: 16px; font-weight: 600; fill: ${theme.text}; }
    .label { font-size: 13px; fill: ${theme.text}; }
    .muted { fill: ${theme.muted}; }
  </style>
  <rect fill="none" stroke="${theme.frame}" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8"/>
  <text x="${padding}" y="32" class="title">Most used languages <tspan class="muted" font-size="12" font-weight="400">· repos active in the last ${YEARS} years</tspan></text>
  <clipPath id="bar"><rect x="${padding}" y="48" width="${barWidth}" height="10" rx="5"/></clipPath>
  <g clip-path="url(#bar)">${segments.join("")}</g>
  ${legend.join("\n  ")}
</svg>
`;
  writeFileSync(new URL(`../assets/languages-${name}.svg`, import.meta.url), svg);
}
console.log(languages.map((l) => `${l.name} ${((l.size / sum) * 100).toFixed(1)}%`).join(", "));
