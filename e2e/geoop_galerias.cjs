// Teste ponta a ponta — Geoquímica Operacional, Etapas 3 e 4: tracks das galerias, sincronização, layouts e geologia.
// Uso: node e2e/geoop_galerias.cjs http://127.0.0.1:PORTA/ pasta_arquivos_teste [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const [URL, FX, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";
const X0 = 500000, Y0 = 7800000;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  const chamar = (metodo, caminho, corpo, form) => page.evaluate(async ([metodo, caminho, corpo, form]) => {
    let body, headers = { Authorization: "Bearer " + localStorage.getItem("geomina.token") };
    if (form) { body = new FormData(); for (const [k, v] of Object.entries(form.campos ?? {})) body.append(k, v); body.append(form.campo ?? "arquivo", new Blob([Uint8Array.from(form.bytes ?? [])]), form.nome); if (form.conteudo) { body.delete(form.campo ?? "arquivo"); body.append(form.campo ?? "arquivo", new Blob([form.conteudo]), form.nome); } }
    else if (corpo) { body = JSON.stringify(corpo); headers["Content-Type"] = "application/json"; }
    const r = await fetch("/api/v1" + caminho, { method: metodo, body, headers });
    return r.json().catch(() => null);
  }, [metodo, caminho, corpo, form]);
  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();

  // dados: galeria com 12 amostras; uma ficha com estruturas e foto; descrições
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });
  const dic = Object.fromEntries((await chamar("GET", "/dicionarios")).map((d) => [d.codigo, Object.fromEntries(d.termos.map((t) => [t.codigo, t]))]));
  const L = dic.LITOLOGIA, E = dic.TIPO_ESTRUTURA, A = dic.ALTERACAO;
  const n = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "NIVEL", codigo: "N144", nome: "N144" });
  const g = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "GALERIA", codigo: "TV-1F5", nome: "Travessa 1F5", pai_id: n.id });
  const ficha = await chamar("POST", "/mapeamentos", { unidade_id: g.id, data: "2026-09-12", x: X0 + 40, y: Y0, z: 500,
    intervalos: [{ de_m: 0, ate_m: 3, litologia_id: L.FLX.id }],
    medidas: [{ tipo_id: E.S1.id, valor_a: 230, valor_b: 30 }, { tipo_id: E.FRATURA.id, valor_a: 160, valor_b: 85, familia: "FR-II" }] });
  const foto = fs.readFileSync(path.join(FX, "frente1.jpg"));
  await chamar("POST", "/documentos", null, { campo: "arquivos", nome: "frente1.jpg", bytes: [...foto], campos: { mina_id: mina.id, categoria: "foto", mapeamento_id: ficha.id } });
  let csv = "Amostra;Tipo;Cr (ppm);Be (ppm);F (ppm);MgO (%)\n";
  const litos = [L.FLX, L.ANG, L.GNP];
  for (let i = 0; i < 12; i++) {
    const cod = `BS-RP-${700 + i}`;
    await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: cod, unidade_id: g.id, x: X0 + i * 20, y: Y0 + (i % 3), z: 500, srid: 31983,
      litologia_id: litos[i % 3].id, alteracao_id: i % 4 === 0 ? A.FLOGOPITIZACAO.id : null, data_coleta: `2026-09-${String(10 + i).padStart(2, "0")}`,
      mapeamento_id: i === 2 ? ficha.id : null, descricao: i === 2 ? "Flogopita xisto com veios de quartzo" : null });
    csv += `${cod};SMP;${i === 5 ? "<10" : 200 + i * 150};${(2 + i).toFixed(1).replace(".", ",")};${1000 + i * 700};${12 + i}\n`;
  }
  const imp = await chamar("POST", `/minas/${mina.id}/laudos`, null, { nome: "laudo.csv", conteudo: csv });
  await chamar("POST", `/importacoes/${imp.id}/confirmar-laudo`, { certificado: "C-TR-1" });

  // 1. Galeria + analitos → tracks de amostras, litologia e um por analito, colunas na sequência da galeria
  await page.goto(URL.replace(/\/$/, "") + "/geoop/galerias");
  await page.getByRole("button", { name: /^TV-1F5 · 12$/ }).click();
  await page.getByRole("textbox", { name: "Analitos" }).click();
  for (const a of ["Cr (elemento)", "Be (elemento)", "F (elemento)"]) await page.getByRole("option", { name: a }).click();
  await page.keyboard.press("Escape");
  const tracks = page.getByTestId("tracks");
  await tracks.locator('[data-track="F"]').waitFor({ timeout: 30000 });
  const ordemTracks = await tracks.locator("[data-track]").evaluateAll((gs) => gs.map((g) => g.getAttribute("data-track")));
  assert.deepStrictEqual(ordemTracks, ["amostras", "litologia", "Cr", "Be", "F"]);
  const colunas = () => tracks.locator("rect[data-amostra]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-amostra")));
  assert.strictEqual((await colunas()).length, 12);
  assert.strictEqual((await colunas())[0], "BS-RP-700");
  await tracks.locator('[data-track="Cr"]').getByText("<10").waitFor();
  await shot("go3-01-tracks");

  // 2. Configuração: Cr em barras log, Be em pontos; limites manuais mudam a legenda
  await tracks.locator('[data-track="Cr"] text', { hasText: "⚙" }).click();
  let dlg = page.getByRole("dialog");
  await dlg.getByText("Barras").click();
  await dlg.getByRole("textbox", { name: "Escala" }).click();
  await page.getByRole("option", { name: "Logarítmica" }).click();
  await dlg.getByText("Meus limites").click();
  await dlg.getByLabel("Limites (separados por ;)").fill("500; 1000");
  await page.keyboard.press("Escape");
  for (const t of ["≤ 500", "500 – 1.000", "> 1.000"]) await page.getByTestId("legenda").getByText(t, { exact: true }).first().waitFor();
  await tracks.locator('[data-track="Cr"]').getByText("log", { exact: false }).first().waitFor();
  await tracks.locator('[data-track="Be"] text', { hasText: "⚙" }).click();
  dlg = page.getByRole("dialog");
  await dlg.getByText("Pontos").click();
  await dlg.getByRole("button", { name: "↑ Subir" }).click();
  await page.keyboard.press("Escape");
  assert.deepStrictEqual(await tracks.locator("[data-track]").evaluateAll((gs) => gs.map((g) => g.getAttribute("data-track"))), ["amostras", "litologia", "Be", "Cr", "F"], "reordenar");
  assert.ok(await tracks.locator('[data-track="Be"] circle').count() >= 11, "Be em pontos");

  // 3. Tracks geológicos: estruturas, descrição, fotos e alteração
  for (const g_ of ["Estruturas", "Descrição", "Fotos e croquis", "Alteração"]) {
    await page.getByRole("button", { name: "+ Track" }).click();
    await page.getByRole("menuitem", { name: g_ }).click();
  }
  await tracks.locator('[data-track="estruturas"]').getByText("S1 230/30").waitFor();
  await tracks.locator('[data-track="fotos"]').getByText(/📷1/).waitFor();
  await tracks.locator('[data-track="descricao"]').getByText(/Flogopita xisto com veios/).waitFor();
  await tracks.locator('[data-track="alteracao"]').getByText(/Flogopit/).first().waitFor();
  await shot("go4-01-geologia");

  // 4. Sincronização: clique na coluna → contexto + tabela + planta; clique na tabela → coluna destacada
  await tracks.locator('rect[data-amostra="BS-RP-702"]').click();
  const ctxP = page.getByTestId("painel-contexto");
  await ctxP.getByText("BS-RP-702", { exact: true }).waitFor();
  await ctxP.getByText(/frente1|Fotos e croquis da ficha/).first().waitFor();
  await page.getByTestId("tabela-galeria").locator('tr[data-amostra="BS-RP-702"]').waitFor();
  assert.strictEqual(await page.getByTestId("coluna-selecionada").getAttribute("data-sel"), "BS-RP-702");
  await page.getByTestId("planta-selecionado").waitFor();
  await page.getByTestId("tabela-galeria").locator('tr[data-amostra="BS-RP-709"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="coluna-selecionada"]')?.getAttribute("data-sel") === "BS-RP-709");
  await ctxP.getByText("BS-RP-709", { exact: true }).waitFor();

  // 5. Zoom sincronizado (roda) e seleção de trecho (Shift+arrastar)
  const caixa = await tracks.boundingBox();
  await page.mouse.move(caixa.x + caixa.width * 0.7, caixa.y + 60);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(300);
  const visiveis = (await colunas()).length;
  assert.ok(visiveis < 12 && visiveis >= 3, `zoom: ${visiveis} colunas visíveis`);
  await page.getByText(/^Colunas \d+–\d+ de 12/).waitFor();
  await page.getByRole("button", { name: "Ver todas" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="tracks"] rect[data-amostra]').length === 12);
  const c2 = await tracks.boundingBox();
  const xCol = (i) => c2.x + 132 + (i + 0.5) * ((c2.width - 136) / 12);
  await page.keyboard.down("Shift");
  await page.mouse.move(xCol(3), c2.y + 80); await page.mouse.down(); await page.mouse.move(xCol(6), c2.y + 80, { steps: 5 }); await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.getByText("Trecho selecionado: 4 amostra(s), pontos 4–7").waitFor();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar o trecho (CSV)" }).click()]);
  const trechoCsv = fs.readFileSync(await dl.path(), "utf-8").trim().split("\n");
  assert.strictEqual(trechoCsv.length, 5);
  assert.match(trechoCsv[1], /^4;BS-RP-703;/);
  await page.getByRole("button", { name: "Ampliar o trecho" }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="tracks"] rect[data-amostra]').length === 4);
  await shot("go3-02-trecho");
  await page.getByRole("button", { name: "Limpar seleção" }).click();

  // 6. Layout salvo e reaplicado
  await page.getByRole("button", { name: "Layouts" }).click();
  await page.getByRole("menuitem", { name: "Salvar o layout atual…" }).click();
  await page.getByLabel("Nome").fill("Travessa — Be/Cr/F");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await page.getByText('Layout "Travessa — Be/Cr/F" salvo.').waitFor();
  // muda tudo: remove o F e as estruturas
  await tracks.locator('[data-track="F"] text', { hasText: "⚙" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remover track" }).click();
  await tracks.locator('[data-track="F"]').waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Layouts" }).click();
  await page.getByRole("menuitem", { name: "Travessa — Be/Cr/F" }).click();
  await tracks.locator('[data-track="F"]').waitFor();
  assert.deepStrictEqual(await tracks.locator("[data-track]").evaluateAll((gs) => gs.map((g) => g.getAttribute("data-track"))),
    ["amostras", "litologia", "Be", "Cr", "F", "estruturas", "descricao", "fotos", "alteracao"]);

  // 7. Exportar tracks em SVG
  await page.getByTestId("area-analitica").getByRole("button", { name: "Exportar", exact: true }).click();
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /^Tracks \(SVG\)/ }).click()]);
  assert.match(fs.readFileSync(await dl2.path(), "utf-8"), /<svg[^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"[\s\S]*BS-RP-706/, "exporta a janela visível (trecho ampliado)");

  assert.deepStrictEqual(erros, []);
  console.log("E2E GEOQUÍMICA OPERACIONAL (ETAPAS 3 E 4) OK: 7 cenários aprovados");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
