// Teste ponta a ponta — Geoquímica Operacional, Etapa 6: comparação entre grupos.
// Uso: node e2e/geoop_comparacao.cjs http://127.0.0.1:PORTA/ [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");

const [URL, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true })).newPage();
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  const chamar = (metodo, caminho, corpo, form) => page.evaluate(async ([metodo, caminho, corpo, form]) => {
    let body, headers = { Authorization: "Bearer " + localStorage.getItem("geomina.token") };
    if (form) { body = new FormData(); body.append("arquivo", new Blob([form.conteudo]), form.nome); }
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

  // 3 galerias com teores bem diferentes; GA: Cr 100..500 (mediana 300), GB: 1000..5000, GC: 10x; uma <LD em GA
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });
  const lit = Object.fromEntries((await chamar("GET", "/dicionarios")).map((d) => [d.codigo, d.termos])).LITOLOGIA;
  const n = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "NIVEL", codigo: "N1", nome: "N1" });
  const gs = [];
  for (const c of ["GA", "GB", "GC"]) gs.push(await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "GALERIA", codigo: c, nome: `Galeria ${c}`, pai_id: n.id }));
  let csv = "Amostra;Tipo;Cr (ppm);Be (ppm);F (ppm)\n", k = 0;
  for (const [gi, g] of gs.entries()) for (let i = 1; i <= 5; i++) {
    k++;
    const cod = `BS-RP-${100 + k}`;
    await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: cod, unidade_id: g.id, litologia_id: lit[i % 2].id });
    const cr = gi === 0 ? i * 100 : gi === 1 ? i * 1000 : i * 10;
    csv += `${cod};SMP;${gi === 0 && i === 5 ? "<10" : cr};${i * (gi + 1)};${cr * 2}\n`;
  }
  const imp = await chamar("POST", `/minas/${mina.id}/laudos`, null, { nome: "laudo.csv", conteudo: csv });
  await chamar("POST", `/importacoes/${imp.id}/confirmar-laudo`, { certificado: "C-CMP-1" });

  await page.goto(URL.replace(/\/$/, "") + "/geoop/comparacao");
  await page.getByText("Monte a seleção no painel").waitFor();
  await page.getByRole("textbox", { name: "Analitos" }).click();
  for (const a of ["Cr (elemento)", "Be (elemento)", "F (elemento)"]) await page.getByRole("option", { name: a }).click();
  await page.keyboard.press("Escape");

  // 1. Agrupar por galeria → 3 grupos com as amostras de cada uma
  await page.getByRole("button", { name: "Agrupar por…" }).click();
  await page.getByRole("menuitem", { name: "Galeria / travessa / rampa" }).click();
  const grupos = page.getByTestId("grupos");
  for (const g of ["GA", "GB", "GC"]) await grupos.getByRole("textbox", { name: /Nome do grupo/ }).and(page.locator(`[value="${g}"]`)).waitFor();
  await grupos.getByText("5 amostras").first().waitFor();

  // 2. Estatísticas conferidas: GA Cr medidos 100,200,300,400 (o <10 fica fora): mediana 250, média 250
  const tab = page.getByTestId("tabela-estatisticas");
  const linhaGA = tab.locator('tr[data-linha="Cr|GA"]');
  await linhaGA.waitFor();
  const celulas = (await linhaGA.locator("td").allInnerTexts()).map((t) => t.trim());
  assert.deepStrictEqual(celulas.slice(2), ["4", "100", "175", "250", "325", "400", "250", "129,1", "51,64", "221,3", "1", "0"], `linha GA: ${celulas}`);
  await shot("go6-01-estatisticas");

  // 3. Incluir os valores no limite: n passa a 5 e o mínimo é 10
  await page.getByLabel("Incluir valores no limite (<LD)").check();
  await page.waitForFunction(() => document.querySelector('tr[data-linha="Cr|GA"]')?.querySelectorAll("td")[2]?.textContent?.trim() === "5");
  await page.getByLabel("Incluir valores no limite (<LD)").uncheck();

  // 4. Boxplot, histograma, dispersão e correlação
  await page.getByText("Boxplot", { exact: true }).click();
  const box = page.getByTestId("boxplot-Cr");
  await box.waitFor();
  assert.strictEqual(await box.locator("g[data-grupo]").count(), 3);
  await page.getByLabel("Escala log").check();
  await box.getByText("· log").waitFor();
  await shot("go6-02-boxplot");
  await page.getByText("Histograma", { exact: true }).click();
  await page.getByTestId("histograma-Cr").waitFor();
  await page.getByText("Dispersão", { exact: true }).click();
  await page.getByTestId("dispersao").getByText(/GB: n = 5 · Pearson r = 1[,.]00/).waitFor();
  await page.getByText("Correlação", { exact: true }).click();
  await page.getByTestId("correlacao-GA").waitFor();
  await shot("go6-03-correlacao");

  // 5. Grupo a partir da seleção atual (litologia) — a descrição mostra o filtro usado
  await page.getByRole("button", { name: "Limpar grupos" }).click();
  const fac = page.getByTestId("painel-filtros");
  await fac.getByRole("button", { name: "Geologia" }).click();
  await fac.locator('[data-faceta="litologia"] label').first().click();
  await page.getByRole("button", { name: "+ Grupo da seleção atual" }).click();
  await grupos.getByText(/Litologia: /).waitFor();
  await page.getByText("Estatísticas", { exact: true }).click();
  await tab.locator('tr[data-linha="Cr|Grupo A"]').waitFor();

  // 6. Exportar estatísticas
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar estatísticas (CSV)" }).click()]);
  const t = fs.readFileSync(await dl.path(), "utf-8").trim().split("\n");
  assert.strictEqual(t.length, 1 + 3);
  assert.match(t[1], /^Cr;ppm;Grupo A;Litologia: /);

  assert.deepStrictEqual(erros, []);
  console.log("E2E GEOQUÍMICA OPERACIONAL (ETAPA 6 — COMPARAÇÃO) OK: 6 cenários aprovados");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
