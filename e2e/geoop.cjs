// Teste ponta a ponta — Geoquímica Operacional, Etapa 2 (área de trabalho, filtros encadeados, consulta, contexto, conciliação).
// Uso: node e2e/geoop.cjs http://127.0.0.1:PORTA/ [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");

const [URL, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";
const X0 = 500000, Y0 = 7800000;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
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

  // dados: 2 níveis, 3 galerias, amostras cadastradas e códigos só no laudo (sub-amostras, não cadastradas, fora das regras)
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });
  const lit = Object.fromEntries((await chamar("GET", "/dicionarios")).map((d) => [d.codigo, d.termos])).LITOLOGIA;
  const un = (tipo, codigo, pai) => chamar("POST", "/unidades", { mina_id: mina.id, tipo, codigo, nome: codigo, pai_id: pai });
  const n1 = await un("NIVEL", "N144"), n2 = await un("NIVEL", "N120");
  const g1 = await un("GALERIA", "GAL-01", n1.id), g2 = await un("GALERIA", "GAL-02", n1.id), g3 = await un("GALERIA", "GAL-03", n2.id);
  let csv = "Amostra;Tipo;Cr (ppm);Be (ppm);MgO (%);F (ppm)\n";
  for (let i = 0; i < 6; i++) {
    const cod = `BS-RP-${100 + i}`;
    await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: cod, unidade_id: i < 4 ? g1.id : g2.id, x: X0 + i * 20, y: Y0, z: 500, srid: 31983,
      litologia_id: lit[i % 2].id, data_coleta: `2026-09-${String(10 + i).padStart(2, "0")}` });
    csv += `${cod};SMP;${300 + i * 200};${3 + i};${15 + i};${1000 + i * 500}\n`;
  }
  await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: "BS-RP-200", unidade_id: g3.id, x: X0 + 900, y: Y0, z: 450, srid: 31983 });
  csv += "BS-RP-200;SMP;<10;1;12;800\nBS-RP-200A;SMP;1500;9;20;7000\nBS-RP-200B;SMP;1600;10;21;7100\nBS-RP-200A;DUP;1510;9;20;6990\n";
  csv += "BMT-TS-458;SMP;519;4,2;17,6;1710\nSAB-CP-026;SMP;100;1;1;100\nOREAS920B;STD;100;2,2;0,33;--\n";
  const imp = await chamar("POST", `/minas/${mina.id}/laudos`, null, { nome: "laudo.csv", conteudo: csv });
  await chamar("POST", `/importacoes/${imp.id}/confirmar-laudo`, { certificado: "C-OP-1" });

  // 1. Área de trabalho: menu, abas, painel de filtros, total com amostras só no laudo
  await page.getByRole("navigation").getByRole("link", { name: "Geoquímica operacional" }).click();
  for (const a of ["Galerias e frentes", "Sondagens", "Comparação", "Visualização espacial", "Consulta de amostras"]) await page.getByRole("tab", { name: a }).waitFor();
  await page.getByTestId("total").filter({ hasText: "11 amostras" }).waitFor(); // 7 cadastradas + 200A, 200B, BMT-TS-458, SAB-CP-026
  const filtros = page.getByTestId("painel-filtros");
  await filtros.locator('[data-faceta="nivel"]').getByText("N144").waitFor();

  // 2. Filtros encadeados: o nível restringe as galerias, com contagens
  await filtros.locator('[data-faceta="nivel"]').getByText("N144").click();
  await page.getByTestId("total").filter({ hasText: "6 amostras" }).waitFor();
  const galerias = await filtros.locator('[data-faceta="galeria"] label').allInnerTexts();
  assert.deepStrictEqual(galerias.map((t) => t.replace(/\s+/g, " ").trim()), ["GAL-01 4", "GAL-02 2"], "nível N144 restringe as galerias");
  await page.getByTestId("caminho").filter({ hasText: "MINA01 › N144" }).waitFor();
  await shot("geoop-01-filtros");

  // 3. Consulta: analitos escolhidos, todos os resultados (inclusive só no laudo), seleção → painel de contexto
  await filtros.getByRole("button", { name: "Limpar" }).click();
  await page.getByTestId("total").filter({ hasText: "11 amostras" }).waitFor();
  await page.getByRole("tab", { name: "Consulta de amostras" }).click();
  await page.getByRole("textbox", { name: "Analitos" }).click();
  for (const a of ["Cr (elemento)", "F (elemento)"]) await page.getByRole("option", { name: a }).click();
  await page.keyboard.press("Escape");
  const tabela = page.getByTestId("tabela-consulta");
  await tabela.getByRole("columnheader", { name: "Cr" }).waitFor();
  await tabela.getByRole("row").filter({ hasText: "BS-RP-200A" }).getByRole("cell", { name: "1500" }).waitFor();
  await tabela.getByRole("row").filter({ hasText: "SAB-CP-026" }).waitFor();
  await tabela.getByRole("row").filter({ hasText: "BS-RP-200" }).first().getByRole("cell", { name: "<10" }).waitFor();
  await tabela.getByRole("row").filter({ hasText: "BS-RP-200A" }).click();
  const ctxP = page.getByTestId("painel-contexto");
  await ctxP.getByText("Resultados do laudo (8)").waitFor(); // 4 analitos SMP + 4 DUP
  await ctxP.getByText("só no laudo", { exact: true }).waitFor();
  const linhaCr = ctxP.getByTestId("resultados-elemento").getByRole("row").filter({ hasText: /^Cr/ });
  assert.match((await linhaCr.innerText()).replace(/\s+/g, " "), /Cr 1500 ppm 1510/, "valor e duplicata do laboratório lado a lado");
  await shot("geoop-02-contexto");

  // 4. Conciliação: sub-amostras herdam o ponto; não cadastrada vira cadastro; fora das regras continua utilizável
  await page.getByText(/código\(s\) do laudo não estão no cadastro/).waitFor();
  await page.getByRole("button", { name: "Conciliar laudo × cadastro…" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText("Sub-amostras (2)").waitFor();
  await dlg.getByText("ponto BS-RP-200").first().waitFor();
  await dlg.getByRole("button", { name: "Marcar todas" }).first().click();
  await dlg.getByRole("button", { name: "Criar 2 sub-amostra(s)" }).click();
  await page.getByText("2 amostra(s) cadastrada(s); 12 resultado(s) ligados.").waitFor();
  await dlg.getByRole("checkbox", { name: "Marcar BMT-TS-458" }).check();
  await dlg.getByRole("button", { name: "Cadastrar 1 amostra(s)" }).click();
  await page.getByText("1 amostra(s) cadastrada(s); 4 resultado(s) ligados.").waitFor();
  await dlg.getByText("SAB-CP-026 (4)").waitFor();
  await page.keyboard.press("Escape");
  await tabela.getByRole("row").filter({ hasText: "BS-RP-200A" }).getByText("Com resultado").waitFor();
  await ctxP.getByText("cadastrada", { exact: true }).waitFor();
  await ctxP.getByText("GAL-03 — GAL-03").waitFor(); // herdou a galeria do ponto
  await shot("geoop-03-conciliado");

  // 5. Faixa de teor + status no painel
  await filtros.getByRole("textbox", { name: "Analito da faixa de teor" }).click();
  await page.getByRole("option", { name: "Cr", exact: true }).click();
  await filtros.getByRole("textbox", { name: "Teor mínimo" }).fill("1000");
  await page.getByTestId("total").filter({ hasText: "4 amostras" }).waitFor(); // 105 (1300), 200A, 200B... e 104 (1100)
  await filtros.getByRole("button", { name: "Limpar" }).click();

  // 6. Galerias: escolha rápida da galeria, faixa de teores; clique na coluna → painel de contexto da amostra
  await page.getByRole("tab", { name: "Galerias e frentes" }).click();
  await page.getByRole("button", { name: /^GAL-01 · 4$/ }).click();
  const tracks = page.getByTestId("tracks");
  await tracks.waitFor({ timeout: 30000 });
  assert.deepStrictEqual(await tracks.locator("rect[data-amostra]").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-amostra"))), ["BS-RP-100", "BS-RP-101", "BS-RP-102", "BS-RP-103"]);
  await tracks.locator('rect[data-amostra="BS-RP-102"]').click();
  await ctxP.getByText("BS-RP-102", { exact: true }).waitFor();
  await shot("geoop-04-galerias");

  // 7. Recolher filtros e menu: a área analítica ganha espaço; exportar CSV com os filtros
  const largura0 = (await page.getByTestId("area-analitica").boundingBox()).width;
  await page.getByRole("button", { name: "Recolher filtros" }).click();
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await page.waitForTimeout(400);
  const largura1 = (await page.getByTestId("area-analitica").boundingBox()).width;
  assert.ok(largura1 > largura0 + 400, `área analítica deveria crescer: ${largura0} → ${largura1}`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar CSV" }).click()]);
  const texto = fs.readFileSync(await dl.path(), "utf-8");
  assert.match(texto, /galeria=/);
  assert.match(texto, /BS-RP-103;sim;Com resultado;N144;GAL-01/);
  await page.getByRole("button", { name: "Mostrar menu" }).click();
  await page.getByRole("tab", { name: "Consulta de amostras" }).click();
  await page.getByTestId("tabela-consulta").waitFor();
  await page.waitForTimeout(500);
  assert.strictEqual(await page.getByText(/ainda não estão ligadas a uma galeria/).count(), 0, "testemunho (BMT-TS) não é cobrado como amostra de galeria");

  // 8. Abas ainda não construídas não mostram dados de exemplo
  await page.getByRole("tab", { name: "Sondagens" }).click();
  await page.getByText("Este ambiente ainda não foi construído").waitFor();

  assert.deepStrictEqual(erros, []);
  console.log("E2E GEOQUÍMICA OPERACIONAL (ETAPA 2) OK: 8 cenários aprovados");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
