// E2E das cores do tema Discord Escuro: renderiza o app web no mesmo layout do
// Discord (1912x1031), amostra os pixels de cada região e exige ΔE2000 ≤ 2 em
// relação às cores medidas no Discord de verdade (prints do cliente desktop).
// Uso: backend rodando e o dist-web servido com o proxy do backend:
//   (frontend) yarn build:web && WEB_BACKEND_URL=http://localhost:8080 yarn preview:web
//   APP=http://localhost:4173/ BACKEND_LOG=<saída do backend> CHROME=<chrome> [OUT=pasta-dos-prints] \
//     node scripts/e2e-cores-discord.mjs
// Com OUT, salva os prints (dm.png, dm-hover.png, servidor.png, modal.png) e
// amostras.json (região, cor medida no Discord, cor do app, ΔE).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "module";
import { createE2E } from "./lib/e2e.mjs";
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url),
);
const { chromium } = require("playwright");

const APP = process.env.APP ?? "http://localhost:4173/";
const API = new URL("api", APP).toString();
const OUT = process.env.OUT;
const MAX_DELTA_E = 2;
const run = Date.now().toString(36);
const { api, makeUser } = createE2E({ api: API, run });

// --- ΔE CIEDE2000 (a mesma conta de frontend/src/renderer/src/shared/lib/colorDiff.ts) ---
function lab([r, g, b]) {
  const lin = (v) =>
    (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const [lr, lg, lb] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t) =>
    t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const rad = (d) => (d * Math.PI) / 180;
function deltaE([l1, a1, b1], [l2, a2, b2]) {
  const cm = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7)));
  const a1p = (1 + g) * a1,
    a2p = (1 + g) * a2;
  const c1 = Math.hypot(a1p, b1),
    c2 = Math.hypot(a2p, b2);
  const hue = (y, x) =>
    x === 0 && y === 0 ? 0 : ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const h1 = hue(b1, a1p),
    h2 = hue(b2, a2p);
  let dh = h2 - h1;
  if (c1 * c2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(rad(dh / 2));
  const lm = (l1 + l2) / 2,
    cp = (c1 + c2) / 2;
  let hm = h1 + h2;
  if (c1 * c2 !== 0)
    hm = Math.abs(h1 - h2) <= 180 ? hm / 2 : (hm + (hm < 360 ? 360 : -360)) / 2;
  const t =
    1 -
    0.17 * Math.cos(rad(hm - 30)) +
    0.24 * Math.cos(rad(2 * hm)) +
    0.32 * Math.cos(rad(3 * hm + 6)) -
    0.2 * Math.cos(rad(4 * hm - 63));
  const sl = 1 + (0.015 * (lm - 50) ** 2) / Math.sqrt(20 + (lm - 50) ** 2);
  const sc = 1 + 0.045 * cp;
  const sh = 1 + 0.015 * cp * t;
  const rc = 2 * Math.sqrt(cp ** 7 / (cp ** 7 + 25 ** 7));
  const rt = -Math.sin(rad(60 * Math.exp(-(((hm - 275) / 25) ** 2)))) * rc;
  const vl = (l2 - l1) / sl,
    vc = (c2 - c1) / sc,
    vh = dH / sh;
  return Math.sqrt(vl * vl + vc * vc + vh * vh + rt * vc * vh);
}
const hex = (rgb) =>
  "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// Regiões em pixels do print 1912x1031 e a cor medida no Discord naquela região
// (moda dos pixels nos prints do dono: DM completa, modais e painel do usuário).
const DISCORD_DM = [
  ["trilho de servidores", [58, 400, 68, 600], "#121214"],
  ["barra lateral (DMs)", [100, 820, 280, 940], "#121214"],
  ["DM selecionada", [270, 735, 298, 765], "#2c2c30"],
  ["chat", [800, 150, 1200, 300], "#1a1a1e"],
  ["caixa de mensagem", [700, 964, 1700, 972], "#222327"],
  ["painel do usuário", [200, 985, 260, 1000], "#202024"],
];
const DISCORD_DM_HOVER = [["DM com o mouse em cima", null, "#222225"]];
const DISCORD_SERVIDOR = [
  ["painel lateral (busca)", [1700, 700, 1900, 900], "#222327"],
];
const DISCORD_MODAL = [["modal", [738, 330, 752, 340], "#242429"]];

const results = [];
async function sample(page, shot, scene, regions) {
  const b64 = shot.toString("base64");
  const pixels = await page.evaluate(
    async ({ b64, regions }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return regions.map(([, [x0, y0, x1, y1]]) => {
        const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        const count = new Map();
        for (let i = 0; i < d.length; i += 4) {
          const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
          count.set(k, (count.get(k) ?? 0) + 1);
        }
        const [best, n] = [...count].sort((a, b) => b[1] - a[1])[0];
        return {
          rgb: [best >> 16, (best >> 8) & 255, best & 255],
          share: n / (d.length / 4),
        };
      });
    },
    { b64, regions: regions.map(([name, box]) => [name, box]) },
  );
  regions.forEach(([name, , want], i) => {
    const got = hex(pixels[i].rgb);
    const de = deltaE(lab(pixels[i].rgb), lab(rgbOf(want)));
    results.push({
      scene,
      region: name,
      discord: want,
      salinha: got,
      deltaE: Number(de.toFixed(2)),
      share: Number(pixels[i].share.toFixed(2)),
    });
  });
}

const ana = await makeUser("Niccc");
const lorena = await makeUser("Lorena");
const others = [];
for (const n of ["Mugis", "Carlos", "Djonga"]) others.push(await makeUser(n));
for (const f of [lorena, ...others]) {
  await api("/friends/request", {
    token: ana.token,
    method: "POST",
    body: { username: f.username },
  });
  await api(`/friends/${ana.username}/accept`, {
    token: f.token,
    method: "PUT",
  });
}
const conv = await api(`/conversations/with/${lorena.id}`, {
  token: ana.token,
});
const convId = conv.id ?? conv.conversation?.id;
const say = (u, content) =>
  api(`/conversations/${convId}/messages`, {
    token: u.token,
    method: "POST",
    body: { content, attachment_ids: [] },
  });
for (const [u, t] of [
  [lorena, "UAI?"],
  [lorena, "vai jogar mais nd n?"],
  [ana, "Muck"],
  [ana, "leeninja?"],
  [lorena, "Ele eh amigo dos doidos"],
])
  await say(u, t);
for (const f of others) {
  const c = await api(`/conversations/with/${f.id}`, { token: ana.token });
  await api(`/conversations/${c.id ?? c.conversation?.id}/messages`, {
    token: ana.token,
    method: "POST",
    body: { content: "oi", attachment_ids: [] },
  });
}
const server = await api("/servers", {
  token: ana.token,
  method: "POST",
  body: { name: "Servidor" },
});
const serverId = server.id ?? server.server?.id;

const browser = await chromium.launch({ executablePath: process.env.CHROME });
let failed = false;
try {
  const context = await browser.newContext({
    viewport: { width: 1912, height: 1031 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const util = await context.newPage(); // página em branco só para decodificar PNG num canvas
  await page.goto(APP + "login");
  await page.fill("input[autocomplete=username]", ana.email);
  await page.fill("input[type=password]", ana.password);
  await page.click("button[type=submit]");
  await page.getByText("Adicionar amigo").first().waitFor({ timeout: 30000 });
  const save = (name, buf) => {
    if (!OUT) return;
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/${name}.png`, buf);
  };

  await page.goto(APP + `dm/${lorena.id}`);
  await page.getByText("Ele eh amigo dos doidos").waitFor({ timeout: 20000 });
  await page.mouse.move(1000, 520);
  await page.waitForTimeout(600);
  let shot = await page.screenshot();
  save("dm", shot);
  // A DM aberta é a linha selecionada: acha pelo nome dentro da barra lateral (x < 310).
  const rows = await page.getByText("Lorena", { exact: true }).all();
  let selY = -1;
  for (const r of rows) {
    const b = await r.boundingBox();
    if (b && b.x < 310 && b.y > 100) selY = Math.round(b.y + b.height / 2);
  }
  if (selY < 0)
    throw new Error("DM selecionada não encontrada na barra lateral");
  await sample(
    util,
    shot,
    "dm",
    DISCORD_DM.map(([n, r, c]) =>
      n === "DM selecionada"
        ? [n, [270, selY - 10, 298, selY + 10], c]
        : [n, r, c],
    ),
  );

  // Mouse em cima de uma DM que não é a aberta; amostra o lado direito da linha, sem texto.
  const box = await page
    .getByText("Carlos", { exact: true })
    .first()
    .boundingBox();
  const cy = Math.round(box.y + box.height / 2);
  await page.mouse.move(200, cy);
  await page.waitForTimeout(400);
  shot = await page.screenshot();
  save("dm-hover", shot);
  await sample(
    util,
    shot,
    "dm-hover",
    [[DISCORD_DM_HOVER[0], [270, cy - 10, 298, cy + 10]]].map(
      ([[n, , c], r]) => [n, r, c],
    ),
  );

  await page.goto(APP + `servers/${serverId}`);
  await page.getByText("Dono do Servidor").waitFor({ timeout: 20000 });
  // O painel lateral que o Salinha pinta com --bg-members é o de resultados da busca.
  await page.getByPlaceholder("Buscar em Servidor").fill("oi");
  await page.keyboard.press("Enter");
  await page
    .getByText(/resultado/i)
    .first()
    .waitFor({ timeout: 10000 });
  await page.mouse.move(1000, 520);
  await page.waitForTimeout(600);
  shot = await page.screenshot();
  save("servidor", shot);
  await sample(util, shot, "servidor", DISCORD_SERVIDOR);

  await page.getByLabel("Adicionar servidor").click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(500);
  shot = await page.screenshot();
  save("modal", shot);
  await sample(util, shot, "modal", DISCORD_MODAL);
} finally {
  await browser.close();
}

console.table(results);
if (OUT)
  writeFileSync(`${OUT}/amostras.json`, JSON.stringify(results, null, 2));
for (const r of results) {
  const ok = r.deltaE <= MAX_DELTA_E && r.share >= 0.5;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${r.scene}: ${r.region} ${r.salinha} vs Discord ${r.discord} (ΔE ${r.deltaE})`,
  );
}
process.exit(failed ? 1 : 0);
