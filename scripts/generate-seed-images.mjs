import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const seedDir = path.join(root, "scripts", "seed");
const publicSeedDir = path.join(root, "public", "seed");
const personaDir = path.join(publicSeedDir, "personas");
const roomDir = path.join(publicSeedDir, "rooms");

mkdirSync(personaDir, { recursive: true });
mkdirSync(roomDir, { recursive: true });

const personasCfg = JSON.parse(readFileSync(path.join(seedDir, "personas.json"), "utf8"));
const roomsCfg = JSON.parse(readFileSync(path.join(seedDir, "rooms.json"), "utf8"));

const demoPersonas = [
  { handle: "aurora_polaris", name: "Aurora", bio: "Chasing lights and long trails." },
  { handle: "grumpy_badger", name: "Grumpy Badger", bio: "Here to disagree, politely-ish." },
];

const demoRooms = [
  { slug: "trailtalk", name: "Trail Talk", category: "hobbies", description: "Hiking, backpacking, and the outdoors." },
];

const PALETTE = [
  "#2563eb", "#dc2626", "#f59e0b", "#059669", "#0891b2", "#7c3aed",
  "#db2777", "#65a30d", "#ea580c", "#0d9488", "#9333ea", "#0284c7",
  "#be123c", "#4d7c0f", "#334155", "#854d0e", "#0f766e", "#9f1239",
];

const SKIN = ["#f3c7a6", "#e6aa78", "#c98255", "#9f6748", "#7a4b35", "#5c3829"];
const HAIR = ["#171717", "#2f221a", "#5f3b24", "#7a4f2a", "#a45b2d", "#d6a35d", "#c8c1b4"];
const SHIRTS = ["#0f766e", "#1d4ed8", "#be123c", "#7c2d12", "#4338ca", "#4d7c0f", "#0f172a"];

const ROOM_COLORS = {
  geo: ["#0f766e", "#38bdf8"],
  conversation: ["#7c3aed", "#f97316"],
  knowledge: ["#1d4ed8", "#facc15"],
  humour: ["#be123c", "#f59e0b"],
  tech: ["#0f172a", "#06b6d4"],
  hobbies: ["#15803d", "#fb7185"],
  culture: ["#6d28d9", "#f472b6"],
  science: ["#0369a1", "#a3e635"],
  practical: ["#854d0e", "#22c55e"],
  sports: ["#1e40af", "#ef4444"],
};

function hash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(items, seed, offset = 0) {
  return items[(seed + offset) % items.length];
}

function safeFileName(value) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shade(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const target = amount >= 0 ? 255 : 0;
  const p = Math.abs(amount);
  const mix = (v) => Math.round(v + (target - v) * p);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function personaHair(seed, color) {
  switch (seed % 7) {
    case 0:
      return `<path d="M73 112c5-39 29-62 58-62 30 0 54 22 59 61-14-13-31-20-52-22-21-2-43 4-65 23Z" fill="${color}"/><path d="M77 115c7-17 23-28 47-31-7 11-21 22-47 31Z" fill="${shade(color, 0.18)}" opacity=".75"/>`;
    case 1:
      return `<path d="M72 126c0-48 23-76 61-76 34 0 55 25 55 67-21-15-46-20-75-16-15 2-28 10-41 25Z" fill="${color}"/><circle cx="178" cy="111" r="20" fill="${color}"/>`;
    case 2:
      return `<path d="M69 101c13-35 36-52 68-50 33 2 52 25 58 68-20-13-42-18-67-18-24 0-43 0-59 0Z" fill="${color}"/><path d="M72 105c-7 23-5 49 10 76h24c-13-27-12-56 2-87Z" fill="${color}"/><path d="M173 93c15 31 16 60 3 88h25c15-30 14-57-2-80Z" fill="${color}"/>`;
    case 3:
      return Array.from({ length: 12 }, (_, i) => {
        const x = 74 + (i % 6) * 22;
        const y = 70 + Math.floor(i / 6) * 20 + (i % 2) * 3;
        return `<circle cx="${x}" cy="${y}" r="${18 + (i % 3)}" fill="${color}"/>`;
      }).join("");
    case 4:
      return `<circle cx="128" cy="49" r="24" fill="${color}"/><path d="M74 119c3-43 25-67 56-67 31 0 51 23 54 67-28-18-64-18-110 0Z" fill="${color}"/>`;
    case 5:
      return `<path d="M69 106c11-35 32-53 64-53 29 0 50 17 61 51-35 6-76 6-125 2Z" fill="${color}"/><path d="M66 107h128c-4 13-16 21-34 24H101c-18-3-30-11-35-24Z" fill="${shade(color, 0.16)}"/>`;
    default:
      return `<path d="M68 119c0-42 24-69 61-69 38 0 62 27 62 70-11-11-23-18-36-22-4 18-19 31-47 41 8-14 10-28 6-43-17 3-32 11-46 23Z" fill="${color}"/>`;
  }
}

function personaAccessories(seed, hairColor) {
  const parts = [];
  if (seed % 4 === 0) {
    parts.push(`<g fill="none" stroke="#1f2937" stroke-width="5" stroke-linecap="round"><circle cx="108" cy="121" r="15"/><circle cx="148" cy="121" r="15"/><path d="M123 121h10"/></g>`);
  }
  if (seed % 5 === 0) {
    parts.push(`<path d="M108 154c12 10 29 10 41 0v10c-12 10-29 10-41 0Z" fill="${hairColor}" opacity=".68"/>`);
  }
  if (seed % 6 === 0) {
    parts.push(`<g fill="${shade(hairColor, 0.3)}" opacity=".75"><circle cx="94" cy="133" r="2"/><circle cx="103" cy="139" r="2"/><circle cx="154" cy="133" r="2"/><circle cx="163" cy="139" r="2"/></g>`);
  }
  return parts.join("");
}

function personaSvg(facet) {
  const handle = facet.handle.toLowerCase();
  const seed = hash(handle);
  const bg1 = pick(PALETTE, seed);
  const bg2 = pick(PALETTE, seed >>> 5, 3);
  const skin = pick(SKIN, seed >>> 2);
  const hair = pick(HAIR, seed >>> 4);
  const shirt = pick(SHIRTS, seed >>> 7);
  const mouth = seed % 3 === 0
    ? `<path d="M111 151c10 10 25 10 35 0" fill="none" stroke="#7f1d1d" stroke-width="5" stroke-linecap="round"/>`
    : `<path d="M114 153c9 4 20 4 29 0" fill="none" stroke="#7f1d1d" stroke-width="5" stroke-linecap="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <title>${esc(handle)} avatar</title>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${bg1}"/>
      <stop offset="1" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  <circle cx="49" cy="42" r="42" fill="#fff" opacity=".13"/>
  <circle cx="213" cy="206" r="70" fill="#000" opacity=".12"/>
  <path d="M42 239c13-39 44-62 86-62s73 23 86 62Z" fill="${shirt}"/>
  <path d="M101 176c11 15 43 15 54 0v32c-14 15-40 15-54 0Z" fill="${shade(skin, -0.1)}"/>
  <ellipse cx="128" cy="119" rx="54" ry="60" fill="${skin}"/>
  <ellipse cx="78" cy="126" rx="12" ry="17" fill="${shade(skin, -0.04)}"/>
  <ellipse cx="178" cy="126" rx="12" ry="17" fill="${shade(skin, -0.04)}"/>
  ${personaHair(seed, hair)}
  <g fill="#111827">
    <circle cx="108" cy="123" r="5"/>
    <circle cx="149" cy="123" r="5"/>
  </g>
  <path d="M128 128c-4 7-6 13-6 18 4 3 9 3 14 0" fill="none" stroke="${shade(skin, -0.24)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
  ${mouth}
  ${personaAccessories(seed, hair)}
  <path d="M85 103c15-9 28-10 40-4M139 99c12-5 25-3 38 6" fill="none" stroke="${shade(hair, 0.08)}" stroke-width="5" stroke-linecap="round" opacity=".65"/>
  <path d="M67 241c9-21 24-38 45-48l16 27 16-27c21 10 36 27 45 48Z" fill="#fff" opacity=".1"/>
</svg>
`;
}

function icon(slug, category) {
  const stroke = `stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const fill = `fill="#fff" opacity=".9"`;
  switch (slug) {
    case "space":
      return `<g ${stroke}><circle cx="256" cy="250" r="70"/><path d="M151 283c70-74 168-116 210-88 29 20-5 76-77 125-70 48-145 61-168 31-13-17 1-43 35-68Z"/><path d="M340 149l16-39 17 39 39 16-39 17-17 39-16-39-39-17Z"/></g>`;
    case "science":
      return `<g ${stroke}><ellipse cx="256" cy="257" rx="130" ry="48"/><ellipse cx="256" cy="257" rx="130" ry="48" transform="rotate(60 256 257)"/><ellipse cx="256" cy="257" rx="130" ry="48" transform="rotate(-60 256 257)"/></g><circle cx="256" cy="257" r="18" ${fill}/>`;
    case "books":
      return `<g ${stroke}><path d="M153 142h137c36 0 59 20 59 52v177H212c-36 0-59-20-59-52Z"/><path d="M153 142v177c0-34 24-54 59-54h137"/></g>`;
    case "movies":
      return `<g ${stroke}><rect x="130" y="154" width="252" height="204" rx="28"/><path d="M130 211h252M183 154v57M256 154v57M329 154v57"/></g>`;
    case "music":
      return `<g ${stroke}><path d="M190 318V151l158-32v167"/><circle cx="162" cy="329" r="40"/><circle cx="320" cy="296" r="40"/></g>`;
    case "cooking":
      return `<g ${stroke}><path d="M154 237h204l-23 112H177Z"/><path d="M137 237h238"/><path d="M200 174c0-31 26-44 26-73M260 174c0-31 26-44 26-73"/></g>`;
    case "fitness":
      return `<g ${stroke}><path d="M112 254h288"/><path d="M138 207v94M374 207v94M72 229v50M440 229v50"/></g>`;
    case "travel":
    case "europe":
    case "usa":
      return `<g ${stroke}><path d="M256 109c64 0 116 52 116 116 0 88-116 178-116 178S140 313 140 225c0-64 52-116 116-116Z"/><circle cx="256" cy="224" r="39"/></g>`;
    case "photography":
      return `<g ${stroke}><rect x="122" y="171" width="268" height="187" rx="32"/><path d="M195 171l24-39h74l24 39"/><circle cx="256" cy="264" r="54"/></g>`;
    case "gaming":
      return `<g ${stroke}><path d="M136 225c10-40 29-60 58-60h124c29 0 48 20 58 60l22 87c8 31-24 54-48 34l-54-44h-80l-54 44c-24 20-56-3-48-34Z"/><path d="M177 248h65M210 216v65M315 231h1M349 267h1"/></g>`;
    case "gardening":
      return `<g ${stroke}><path d="M256 384V193"/><path d="M253 230c-72-6-114-47-126-124 80 3 122 44 126 124Z"/><path d="M259 286c71-8 112-49 121-126-80 6-120 48-121 126Z"/></g>`;
    case "pets":
      return `<g ${stroke}><path d="M176 307c0-44 36-78 80-78s80 34 80 78c0 41-32 73-80 73s-80-32-80-73Z"/><circle cx="164" cy="211" r="27"/><circle cx="225" cy="175" r="27"/><circle cx="287" cy="175" r="27"/><circle cx="348" cy="211" r="27"/></g>`;
    case "hockey":
      return `<g ${stroke}><path d="M185 111l79 246"/><path d="M330 111l-65 213"/><path d="M222 356h126"/><path d="M161 395h74"/></g>`;
    case "programming":
    case "programmerhumor":
      return `<g ${stroke}><path d="M202 178l-82 78 82 78M310 178l82 78-82 78"/><path d="M280 151l-48 210"/></g>`;
    case "privacy":
      return `<g ${stroke}><path d="M256 116l122 46v84c0 75-46 124-122 154-76-30-122-79-122-154v-84Z"/><path d="M218 256h76v80h-76Z"/><path d="M234 256v-32c0-29 44-29 44 0v32"/></g>`;
    case "selfhosted":
    case "technology":
      return `<g ${stroke}><rect x="147" y="128" width="218" height="256" rx="26"/><path d="M184 196h144M184 256h144M184 316h144"/><path d="M205 196h1M205 256h1M205 316h1"/></g>`;
    case "personalfinance":
      return `<g ${stroke}><rect x="126" y="174" width="260" height="184" rx="31"/><path d="M126 225h260"/><path d="M287 293h57"/></g>`;
    case "diy":
      return `<g ${stroke}><path d="M159 358l194-194"/><path d="M124 322l66 66"/><path d="M300 143l69 69"/><path d="M321 122l69 69"/></g>`;
    default:
      if (category === "geo") {
        return `<g ${stroke}><path d="M121 359h270"/><path d="M161 359V221l95-70 95 70v138"/><path d="M215 359v-82h82v82"/><path d="M132 205l124-91 124 91"/></g>`;
      }
      if (category === "knowledge") {
        return `<g ${stroke}><circle cx="256" cy="180" r="58"/><path d="M256 238v55"/><path d="M214 350h84"/><path d="M230 293h52"/></g>`;
      }
      if (category === "humour") {
        return `<g ${stroke}><circle cx="256" cy="256" r="121"/><path d="M208 232h1M304 232h1"/><path d="M197 294c31 32 87 32 118 0"/></g>`;
      }
      return `<g ${stroke}><path d="M151 177h210v139H228l-77 61v-61h0Z"/><path d="M196 227h120M196 273h83"/></g>`;
  }
}

function roomSvg(room) {
  const slug = room.slug.toLowerCase();
  const seed = hash(slug);
  const colors = ROOM_COLORS[room.category] ?? ["#334155", "#14b8a6"];
  const accent = pick(PALETTE, seed >>> 5);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>${esc(slug)} room image</title>
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${colors[0]}"/>
      <stop offset="1" stop-color="${colors[1]}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="72" fill="url(#bg)"/>
  <circle cx="${90 + (seed % 70)}" cy="${82 + ((seed >>> 4) % 76)}" r="86" fill="#fff" opacity=".13"/>
  <circle cx="${368 + ((seed >>> 7) % 70)}" cy="${338 + ((seed >>> 9) % 80)}" r="132" fill="#000" opacity=".12"/>
  <path d="M0 383c75-42 153-59 235-51 113 11 186-17 277-78v258H0Z" fill="${accent}" opacity=".2"/>
  <g opacity=".95">${icon(slug, room.category)}</g>
  <rect x="64" y="64" width="384" height="384" rx="62" fill="none" stroke="#fff" stroke-width="10" opacity=".18"/>
</svg>
`;
}

function write(file, body) {
  writeFileSync(file, body, "utf8");
}

const personaMap = new Map();
for (const rootCfg of personasCfg.roots) {
  for (const facet of rootCfg.facets) personaMap.set(facet.handle.toLowerCase(), facet);
}
for (const facet of demoPersonas) personaMap.set(facet.handle.toLowerCase(), facet);

const roomMap = new Map();
for (const room of roomsCfg.rooms) roomMap.set(room.slug.toLowerCase(), room);
for (const room of demoRooms) roomMap.set(room.slug.toLowerCase(), room);

for (const facet of [...personaMap.values()].sort((a, b) => a.handle.localeCompare(b.handle))) {
  write(path.join(personaDir, `${safeFileName(facet.handle)}.svg`), personaSvg(facet));
}

for (const room of [...roomMap.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
  write(path.join(roomDir, `${safeFileName(room.slug)}.svg`), roomSvg(room));
}

console.log(`Generated ${personaMap.size} persona avatars and ${roomMap.size} room images in public/seed/.`);
