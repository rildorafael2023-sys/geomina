// Teste ponta a ponta — Geoquímica Operacional, Etapas 8 e 9: consulta completa, navegação e exportações.
// Uso: node e2e/geoop_consulta.cjs http://127.0.0.1:PORTA/ [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");

const [URL, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";
const X0 = 500000, Y0 = 7800000;

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })).newPage();
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && !/GPU stall|WebGL/i.test(m.text()) && erros.push(m.text()));
  const chamar = (metodo, caminho, corpo, form) => page.evaluate(async ([metodo, caminho, corpo, form]) => {
    let body, headers = { Authorization: "Bearer " + localStorage.getItem("geomina.token") };
    if (form) { body = new FormData(); for (const [k, v] of Object.entries(form.campos ?? {})) body.append(k, v); for (const [k, v] of Object.entries(form.arquivos)) body.append(k, new Blob([v.conteudo]), v.nome); }
    else if (corpo) { body = JSON.stringify(corpo); headers["Content-Type"] = "application/json"; }
    const r = await fetch("/api/v1" + caminho, { method: metodo, body, headers });
    return r.json().catch(() => null);
  }, [metodo, caminho, corpo, form]);
  const baixar = async (acao) => { const [d] = await Promise.all([page.waitForEvent("download"), acao()]); return fs.readFileSync(await d.path()); };
  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });
  const n = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "NIVEL", codigo: "N1", nome: "N1" });
  const g = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "GALERIA", codigo: "GAL-X", nome: "Galeria X", pai_id: n.id });
  let laudo = "Amostra;Tipo;Cr (ppm);Be (ppm)\n";
  for (let i = 0; i < 5; i++) { await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: `BS-RP-${10 + i}`, unidade_id: g.id, x: X0 + i * 10, y: Y0, z: 500, srid: 31983 }); laudo += `BS-RP-${10 + i};SMP;${[300, 1500, 700, 100, 900][i]};${i === 2 ? "" : i + 1}\n`; }
  const collar = `furo;x;y;z;azimute;dip;eoh\nFX-1;${X0 + 30};${Y0 + 20};520;0;-90;40\n`;
  const p = await chamar("POST", `/minas/${mina.id}/sondagem/importacoes`, null, { campos: { srid: "31983" }, arquivos: { collar: { nome: "c.csv", conteudo: collar }, amostras: { nome: "a.csv", conteudo: "furo;amostra;de;ate\nFX-1;BMT-TS-50;5;7\n" } } });
  await chamar("POST", `/importacoes/${p.id}/confirmar-sondagem`, {});
  laudo += "BMT-TS-50;SMP;2000;9\n";
  const l = await chamar("POST", `/minas/${mina.id}/laudos`, null, { arquivos: { arquivo: { nome: "l.csv", conteudo: laudo } } });
  await chamar("POST", `/importacoes/${l.id}/confirmar-laudo`, { certificado: "C-CS" });

  // 1. Consulta: analitos, ordenar pelo maior teor, colunas, filtro por elemento analisado
  await page.goto(URL.replace(/\/$/, "") + "/geoop/consulta");
  await page.getByRole("textbox", { name: "Analitos" }).click();
  for (const a of ["Cr (elemento)", "Be (elemento)"]) await page.getByRole("option", { name: a }).click();
  await page.keyboard.press("Escape");
  const tabela = page.getByTestId("tabela-consulta");
  await tabela.getByRole("columnheader", { name: "Cr" }).waitFor();
  await page.getByRole("textbox", { name: "Ordenar por" }).click();
  await page.getByRole("option", { name: "Maior teor de Cr" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="tabela-consulta"] tbody tr td')?.textContent === "BMT-TS-50");
  const ordem = await tabela.locator("tbody tr").evaluateAll((trs) => trs.map((t) => t.querySelector("td").textContent));
  assert.deepStrictEqual(ordem, ["BMT-TS-50", "BS-RP-11", "BS-RP-14", "BS-RP-12", "BS-RP-10", "BS-RP-13"]);
  await page.getByRole("button", { name: "Colunas" }).click();
  await page.getByRole("checkbox", { name: "Furo e profundidade" }).check();
  await page.keyboard.press("Escape");
  await tabela.getByText("FX-1 · 5–7 m").waitFor();
  await page.getByTestId("painel-filtros").getByRole("button", { name: "Laboratório" }).isVisible();
  const fe = page.getByTestId("painel-filtros").locator('[data-faceta="analito"]');
  await fe.getByText("Be").waitFor();
  await fe.locator("label").filter({ hasText: /^Be/ }).click();
  await page.getByTestId("total").filter({ hasText: "5 amostras" }).waitFor(); // BS-RP-12 não tem Be
  await fe.locator("label").filter({ hasText: /^Be/ }).click();
  await shot("go8-01-consulta");

  // 2. Navegação a partir da amostra: galeria (tracks), perfil do furo e 3D
  await tabela.locator('tr[data-chave]').filter({ hasText: "BS-RP-11" }).click();
  const ctx = page.getByTestId("painel-contexto");
  await ctx.getByRole("button", { name: "Tracks da galeria GAL-X" }).click();
  await page.waitForURL(/\/geoop\/galerias$/);
  await page.getByTestId("tracks").waitFor();
  assert.strictEqual(await page.getByTestId("coluna-selecionada").getAttribute("data-sel"), "BS-RP-11", "a amostra continua selecionada nos tracks");
  await page.getByTestId("caminho").filter({ hasText: "GAL-X" }).waitFor(); // a navegação aplicou o filtro da galeria em todas as abas
  await page.getByRole("tab", { name: "Consulta de amostras" }).click();
  await page.getByTestId("painel-filtros").getByRole("button", { name: "Limpar" }).click();
  await tabela.locator('tr[data-chave]').filter({ hasText: "BMT-TS-50" }).click();
  await ctx.getByRole("button", { name: "Perfil do furo FX-1" }).click();
  await page.waitForURL(/\/geoop\/sondagens$/);
  await page.getByTestId("perfil-FX-1").waitFor();
  await ctx.getByRole("button", { name: "Ver no 3D" }).click();
  await page.waitForURL(/\/geoop\/espacial$/);
  await page.getByTestId("visor-3d").locator("canvas").waitFor({ timeout: 30000 });

  // 3. Exportações: CSV, Excel (com metadados), GeoPackage, GeoJSON, imagem do 3D
  const exportar = async (item) => { await page.getByRole("button", { name: "Exportar", exact: true }).first().click(); return baixar(() => page.getByRole("menuitem", { name: item }).click()); };
  const csv = (await exportar("Tabela CSV")).toString("utf-8");
  assert.match(csv, /BMT-TS-50;sim;Com resultado/);
  const xlsx = await exportar("Planilha Excel (com metadados)");
  assert.strictEqual(xlsx.subarray(0, 2).toString(), "PK", "Excel é um zip (xlsx)");
  const gpkg = await exportar("GeoPackage (.gpkg)");
  assert.strictEqual(gpkg.subarray(0, 15).toString(), "SQLite format 3", "GeoPackage é SQLite");
  const gj = JSON.parse((await exportar("GeoJSON")).toString("utf-8"));
  assert.strictEqual(gj.features.length, 6);
  assert.deepStrictEqual(gj.features.find((f) => f.properties.amostra === "BMT-TS-50").geometry.coordinates, [[X0 + 30, Y0 + 20, 515], [X0 + 30, Y0 + 20, 513]]);
  const png = await baixar(() => page.getByRole("button", { name: "Imagem (PNG)" }).click());
  assert.strictEqual(png.subarray(1, 4).toString(), "PNG");

  // 4. Gráficos da comparação exportados em SVG
  await page.getByRole("tab", { name: "Comparação" }).click();
  await page.getByRole("button", { name: "+ Grupo da seleção atual" }).click();
  await page.getByText("Boxplot", { exact: true }).click();
  await page.getByTestId("boxplot-Cr").waitFor();
  const svg = (await baixar(() => page.getByRole("button", { name: "Exportar gráficos (SVG)" }).click())).toString("utf-8");
  assert.match(svg, /^<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);

  // 5. Relatório da seleção para imprimir/PDF
  await page.getByRole("button", { name: "Exportar", exact: true }).first().click();
  await page.getByRole("menuitem", { name: "Relatório da seleção (imprimir / PDF)" }).click();
  const rel = page.getByTestId("relatorio");
  await rel.getByText(/Relatório geoquímico — MINA01/).waitFor();
  await rel.getByTestId("relatorio-estatisticas").getByRole("row").filter({ hasText: /^Cr/ }).getByText("6").first().waitFor();
  await page.evaluate(() => { window.__imprimiu = false; window.print = () => { window.__imprimiu = true; }; });
  await rel.getByRole("button", { name: "Imprimir / salvar PDF" }).click();
  assert.ok(await page.evaluate(() => window.__imprimiu));
  await page.emulateMedia({ media: "print" });
  assert.ok(!(await page.getByTestId("painel-filtros").isVisible()), "na impressão só o relatório aparece");
  await page.emulateMedia({ media: "screen" });
  await shot("go9-01-relatorio");

  assert.deepStrictEqual(erros, []);
  console.log("E2E GEOQUÍMICA OPERACIONAL (ETAPAS 8 E 9 — CONSULTA E EXPORTAÇÃO) OK: 5 cenários aprovados");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
