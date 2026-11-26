// Teste ponta a ponta da Etapa 11: análise geoquímica longitudinal das frentes.
// Uso: node e2e/longitudinal.cjs http://127.0.0.1:PORTA/ [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");

const [URL, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";
const X0 = 500000, Y0 = 7800000;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png`, fullPage: true });
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

  // dados: galeria SEM eixo desenhado, amostras em pontos (início, meio, fim), sub-pontos na parede; segunda galeria para comparar
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });
  const dic = Object.fromEntries((await chamar("GET", "/dicionarios")).map((d) => [d.codigo, d.termos]));
  const lit = dic.LITOLOGIA;
  const n = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "NIVEL", codigo: "N144", nome: "Nível 144" });
  const g1 = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "GALERIA", codigo: "GAL-01", nome: "Galeria 01", pai_id: n.id });
  const g2 = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "GALERIA", codigo: "GAL-02", nome: "Galeria 02", pai_id: n.id });
  let csv = "Amostra;Tipo;Cr (ppm);Be (ppm)\n";
  // 8 pontos numa galeria com curva; pontos inseridos fora de ordem; no ponto 4 duas amostras (parede baixa e alta)
  const pontos = [[0, 0], [30, 2], [60, 5], [90, 12], [115, 30], [130, 55], [140, 85], [145, 115]];
  const ordemCadastro = [5, 2, 7, 0, 3, 6, 1, 4];
  for (const i of ordemCadastro) {
    const [dx, dy] = pontos[i];
    const subs = i === 3 ? [["A", 0, 1.5], ["B", 1.5, 3]] : [["", null, null]];
    for (const [suf, de, ate] of subs) {
      const cod = `BS-RP-${300 + i}${suf}`;
      await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: cod, unidade_id: g1.id, x: X0 + dx, y: Y0 + dy, z: 500 - i, srid: 31983,
        litologia_id: lit[i < 4 ? 0 : 1].id, data_coleta: `2026-08-${String(1 + i * 3).padStart(2, "0")}`, secao_de_m: de, secao_ate_m: ate });
      csv += `${cod};SMP;${i === 2 ? "<10" : 300 + i * 150 + (suf === "B" ? 200 : 0)};${(3 + i).toFixed(1).replace(".", ",")}\n`;
    }
  }
  for (let i = 0; i < 4; i++) {
    const cod = `BS-RP-${400 + i}`;
    await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: cod, unidade_id: g2.id, x: X0 + 300 + i * 20, y: Y0, z: 480, srid: 31983 });
    csv += `${cod};SMP;${900 - i * 100};${10 + i}\n`;
  }
  for (let i = 0; i < 2; i++) {  // vieram da planilha só com o texto do local
    const cod = `BS-RP-${500 + i}`;
    await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: cod, local_descricao: "Travessa 1F - 2 - Reta", x: X0 + 380 + i * 20, y: Y0, z: 480, srid: 31983 });
    csv += `${cod};SMP;${500 + i * 10};9\n`;
  }
  const imp = await chamar("POST", `/minas/${mina.id}/laudos`, null, { nome: "laudo.csv", conteudo: csv });
  await chamar("POST", `/importacoes/${imp.id}/confirmar-laudo`, { certificado: "C-LONG-1" });

  // 1. Galeria + analitos → planta numerada e gráficos, sem desenhar eixo
  await page.getByRole("navigation").getByRole("link", { name: "Teores na galeria" }).click();
  await page.getByText("Escolha a galeria e pelo menos um analito.").waitFor();
  await page.getByRole("textbox", { name: "Galeria, travessa ou rampa" }).click();
  await page.getByRole("option", { name: /GAL-01 — Galeria 01 \(Galeria · 9 amostras com coordenadas\)/ }).click();
  await page.getByRole("textbox", { name: "Analitos" }).click();
  await page.getByRole("option", { name: "Cr (elemento)" }).click();
  await page.getByRole("option", { name: "Be (elemento)" }).click();
  await page.keyboard.press("Escape");
  const graf = page.getByTestId("grafico-GAL-01");
  await graf.locator(".main-svg").first().waitFor({ timeout: 30000 });
  await page.getByTestId("planta-GAL-01").locator(".main-svg").first().waitFor();
  await page.getByText(/8 pontos de amostragem ao longo de \d+[.,]\d m · distância pelo caminho entre as amostras · início: ponto da amostra BS-RP-300 \(coleta 01\/08\/2026\)/).waitFor();
  assert.strictEqual(await graf.locator(".scatterlayer .points path.point").count(), 18, "9 amostras × 2 analitos");
  // tabela do início ao fim, na ordem da galeria (não na de cadastro); sub-pontos juntos no ponto 4
  const linhas = await page.getByRole("row").filter({ hasText: /BS-RP-3\d\d/ }).allInnerTexts();
  assert.deepStrictEqual(linhas.map((l) => l.match(/BS-RP-3\d\d[AB]?/)[0]), ["BS-RP-300", "BS-RP-301", "BS-RP-302", "BS-RP-303A", "BS-RP-303B", "BS-RP-304", "BS-RP-305", "BS-RP-306", "BS-RP-307"]);
  assert.match(linhas[0], /^1\s+0[.,]0\s+BS-RP-300/);
  assert.match(linhas[3], /^4\s+\d+[.,]\d\s+BS-RP-303A\s+0–1[.,]5/);
  assert.match(linhas[4], /^\s*BS-RP-303B/, "segundo sub-ponto não repete ponto/distância");
  await shot("e11-01-galeria");

  // 2. Inverter início/fim
  await page.getByRole("button", { name: "Inverter início ⇄ fim" }).click();
  await page.getByText(/início: ponto da amostra BS-RP-307/).waitFor();
  const inv = await page.getByRole("row").filter({ hasText: /BS-RP-3\d\d/ }).first().innerText();
  assert.match(inv, /BS-RP-307/);
  await page.getByRole("button", { name: "Inverter início ⇄ fim" }).click();
  await page.getByText(/início: ponto da amostra BS-RP-300/).waitFor();

  // 3. Clique na tabela → consulta da amostra
  await page.getByRole("row").filter({ hasText: "BS-RP-305" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByText("Amostra BS-RP-305").waitFor();
  await modal.getByText("C-LONG-1").first().waitFor();
  await shot("e11-02-consulta");
  await page.keyboard.press("Escape");

  // 4. Filtros não mudam as distâncias
  const distAntes = await page.getByRole("row").filter({ hasText: "BS-RP-306" }).getByRole("cell").nth(1).innerText();
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page.getByRole("textbox", { name: "Litologia" }).click();
  await page.getByRole("option", { name: new RegExp(lit[1].nome) }).first().click();
  await page.keyboard.press("Escape");
  await page.getByText("4 amostras", { exact: true }).waitFor();
  assert.strictEqual(await page.getByRole("row").filter({ hasText: "BS-RP-306" }).getByRole("cell").nth(1).innerText(), distAntes);
  await page.getByRole("textbox", { name: "Faixa de teor: analito" }).click();
  await page.getByRole("option", { name: "Cr", exact: true }).click();
  await page.getByLabel("Teor mínimo").fill("1000");
  await page.getByText("3 amostras", { exact: true }).waitFor(); // pontos 5, 6, 7: Cr = 300 + 150·i ≥ 1000
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByText("9 amostras", { exact: true }).waitFor();

  // 5. Regra de LD e escala log
  await page.getByRole("textbox", { name: "Abaixo/acima do limite de detecção" }).click();
  await page.getByRole("option", { name: "Não mostrar (contar)" }).click();
  await page.getByText("Cr: 8 valores · 1 <LD · 1 fora").waitFor();
  await page.getByRole("button", { name: "Escalas e aparência" }).click();
  await page.getByRole("checkbox", { name: "log" }).first().check();

  // 6a. Amostras só com texto do local: ligar em lote à galeria pela tela
  await page.getByText("2 amostra(s) ainda não estão ligadas a uma galeria").waitFor();
  await page.getByRole("button", { name: "Ligar às galerias…" }).click();
  await page.getByLabel("Buscar local").fill("1f 2");
  await page.getByRole("button", { name: "Marcar os 1 visíveis" }).click();
  await page.getByRole("textbox", { name: "Unidade da mina" }).click();
  await page.getByRole("option", { name: /GAL-02/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Ligar 2 amostra(s)" }).click();
  await page.getByText("2 amostra(s) ligadas a GAL-02.").waitFor();
  await page.keyboard.press("Escape");
  await page.getByText(/ainda não estão ligadas/).waitFor({ state: "detached" });

  // 6. Comparar com outra galeria (painel próprio) e exportar CSV
  await page.getByRole("button", { name: /^Comparar com outras galerias/ }).click();
  await page.getByRole("textbox", { name: /Outras galerias/ }).click();
  await page.getByRole("option", { name: /GAL-02/ }).click();
  await page.keyboard.press("Escape");
  await page.getByTestId("grafico-GAL-02").locator(".main-svg").first().waitFor({ timeout: 30000 });
  await page.getByText("6 amostras", { exact: true }).waitFor();
  await shot("e11-03-comparacao");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).first().click()]);
  const texto = fs.readFileSync(await dl.path(), "utf-8");
  assert.match(texto, /caminho pelas amostras/);
  assert.strictEqual(texto.trim().split("\n").length, 2 + 9);

  // 7. Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 392, `rolagem lateral no celular: ${largura}`);
  await shot("e11-04-celular");

  assert.deepStrictEqual(erros, []);
  console.log("E2E TEORES NA GALERIA OK: 8 cenários aprovados");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
