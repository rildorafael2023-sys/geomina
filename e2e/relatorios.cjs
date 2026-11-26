// Teste ponta a ponta — E17 relatórios gerais: produção por período, fichas em Excel/CSV, histórico em CSV, impressão.
// Uso: node e2e/relatorios.cjs http://127.0.0.1:PORTA/ [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");

const [URL, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";
const BASE = URL.replace(/\/$/, "");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png`, fullPage: true });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  const chamar = (metodo, caminho, corpo, form) => page.evaluate(async ([metodo, caminho, corpo, form]) => {
    let body, headers = { Authorization: "Bearer " + localStorage.getItem("geomina.token") };
    if (form) { body = new FormData(); for (const [k, v] of Object.entries(form)) body.append(k, new Blob([v.conteudo]), v.nome); }
    else if (corpo) { body = JSON.stringify(corpo); headers["Content-Type"] = "application/json"; }
    const r = await fetch("/api/v1" + caminho, { method: metodo, body, headers });
    return r.json().catch(() => null);
  }, [metodo, caminho, corpo, form]);
  const baixar = async (acao) => { const [d] = await Promise.all([page.waitForEvent("download"), acao()]); return { nome: d.suggestedFilename(), dados: fs.readFileSync(await d.path()) }; };

  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();

  // dados: 3 fichas (out e nov do ano corrente), 3 amostras, 1 laudo
  const ano = new Date().getFullYear();
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });
  const n = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "NIVEL", codigo: "N1", nome: "N1" });
  const g = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "GALERIA", codigo: "GAL-1", nome: "Galeria 1", pai_id: n.id });
  const dic = Object.fromEntries((await chamar("GET", "/dicionarios")).map((d) => [d.codigo, Object.fromEntries(d.termos.map((t) => [t.codigo, t]))]));
  const ficha = (data) => chamar("POST", "/mapeamentos", { unidade_id: g.id, data, intervalos: [{ de_m: 0, ate_m: 2, litologia_id: dic.LITOLOGIA.ANG.id }],
    medidas: [{ tipo_id: dic.TIPO_ESTRUTURA.S1.id, valor_a: 230, valor_b: 30 }], amostras: [] });
  const f1 = await ficha(`${ano}-01-14`);
  await ficha(`${ano}-01-20`);
  await ficha(`${ano}-02-02`);
  await chamar("POST", `/mapeamentos/${f1.id}/submeter`);
  for (const [c, d] of [["BS-RP-1", `${ano}-01-03`], ["BS-RP-2", `${ano}-01-05`], ["BS-RP-3", `${ano}-02-01`]])
    await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: c, unidade_id: g.id, data_coleta: d });
  const l = await chamar("POST", `/minas/${mina.id}/laudos`, null, { arquivo: { nome: "l.csv", conteudo: "Amostra;Tipo;Cr (ppm)\nBS-RP-1;SMP;500\n" } });
  await chamar("POST", `/importacoes/${l.id}/confirmar-laudo`, { certificado: "C-1" });

  // 1. Menu → Relatórios → produção do ano
  await page.goto(BASE + "/");
  await page.getByRole("link", { name: "Relatórios" }).click();
  const prod = page.getByTestId("rel-producao");
  await prod.getByTestId("tabela-meses").waitFor();
  const linhas = await prod.getByTestId("tabela-meses").locator("tbody tr").evaluateAll((trs) => trs.map((t) => [...t.querySelectorAll("td")].map((c) => c.textContent)));
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][new Date().getMonth()];
  // o certificado (sem data de emissão no laudo) conta no mês da importação
  assert.deepStrictEqual([...new Set(linhas.map((x) => x[0]))], [...new Set([`jan/${ano}`, `fev/${ano}`, `${MES}/${ano}`])]);
  assert.strictEqual(linhas[0][1], "2", "2 fichas em janeiro");
  assert.strictEqual(linhas[0][3], "2", "2 amostras em janeiro");
  assert.strictEqual(linhas[0][4], "1 (50%)");
  const pend = prod.getByTestId("pendencias");
  await pend.getByText("Fichas aguardando revisão").waitFor();
  assert.match(await pend.innerText(), /Fichas em rascunho\s*2[\s\S]*aguardando revisão\s*1[\s\S]*sem resultado de laboratório\s*2/);
  await shot("e17-01-producao");
  // período só de fevereiro
  await prod.getByLabel("De").fill(`${ano}-02-01`);
  await prod.getByTestId("tabela-meses").locator("tbody tr").first().filter({ hasText: `fev/${ano}` }).waitFor();
  assert.ok(!(await prod.getByTestId("tabela-meses").getByText(`jan/${ano}`).count()), "janeiro fora do período");
  const x1 = await baixar(() => prod.getByRole("button", { name: "Planilha Excel" }).click());
  assert.strictEqual(x1.nome, "producao.xlsx");
  assert.strictEqual(x1.dados.subarray(0, 2).toString(), "PK");
  // impressão: só o relatório
  await page.emulateMedia({ media: "print" });
  assert.ok(!(await page.getByRole("tab", { name: "Fichas de mapeamento" }).isVisible()), "abas não saem na impressão");
  assert.ok(await prod.getByTestId("tabela-meses").isVisible());
  await page.emulateMedia({ media: "screen" });

  // 2. Fichas: filtros e downloads
  await page.getByRole("tab", { name: "Fichas de mapeamento" }).click();
  const rf = page.getByTestId("rel-fichas");
  await rf.getByTestId("rel-fichas-total").filter({ hasText: "3 ficha(s)" }).waitFor();
  await rf.getByLabel("Até").fill(`${ano}-01-31`);
  await rf.getByTestId("rel-fichas-total").filter({ hasText: "2 ficha(s)" }).waitFor();
  const x2 = await baixar(() => rf.getByRole("button", { name: /Planilha Excel/ }).click());
  assert.strictEqual(x2.nome, "fichas_mapeamento.xlsx");
  assert.strictEqual(x2.dados.subarray(0, 2).toString(), "PK");
  await rf.getByRole("textbox", { name: "Tabela em CSV" }).click();
  await page.getByRole("option", { name: "Estruturas" }).click();
  const c = await baixar(() => rf.getByRole("button", { name: "Baixar CSV" }).click());
  assert.strictEqual(c.nome, "fichas_estruturas.csv");
  const csv = c.dados.toString("utf-8").replace(/^﻿/, "").trim().split("\n");
  assert.strictEqual(csv.length, 3, "cabeçalho + 2 estruturas (só janeiro)");
  assert.match(csv[1], /;230\/30;/);

  // 3. Geoquímica aponta para a consulta; histórico em CSV
  await page.getByRole("tab", { name: "Geoquímica" }).click();
  await page.getByRole("link", { name: "Abrir a consulta de amostras" }).waitFor();
  await page.getByRole("tab", { name: "Histórico de alterações" }).click();
  const h = await baixar(() => page.getByRole("button", { name: "Baixar CSV" }).click());
  assert.strictEqual(h.nome, "historico_alteracoes.csv");
  assert.match(h.dados.toString("utf-8"), /^﻿Quando;Usuário;Operação;Tabela/);
  await shot("e17-02-historico");

  // 4. Sistema: verificação de integridade (E18)
  await page.getByRole("link", { name: "Sistema" }).click();
  const integ = page.getByTestId("integridade");
  await integ.getByRole("button", { name: "Verificar agora" }).click();
  await integ.getByTestId("integridade-resultado").filter({ hasText: "Tudo certo." }).waitFor();
  assert.match(await integ.innerText(), /Arquivos originais[\s\S]*1 arquivo\(s\), conteúdo conferido pelo hash/);
  await page.getByRole("link", { name: "Relatórios" }).click();

  // 5. Celular: sem rolagem lateral
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole("tab", { name: "Produção por período" }).click();
  await page.getByTestId("rel-producao").waitFor();
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(larg <= 390, `sem rolagem lateral no celular (${larg})`);

  assert.deepStrictEqual(erros, []);
  console.log("E2E RELATÓRIOS (E17) OK: 5 cenários aprovados");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
