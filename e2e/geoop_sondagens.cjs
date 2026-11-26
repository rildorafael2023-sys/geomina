// Teste ponta a ponta — Geoquímica Operacional, Etapa 5: sondagens (importação, perfil, trajetória, comparação de furos).
// Uso: node e2e/geoop_sondagens.cjs http://127.0.0.1:PORTA/ [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const [URL, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";
const X0 = 500000, Y0 = 7800000;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sond-"));
  const arq = (n, t) => { const p = path.join(tmp, n); fs.writeFileSync(p, t); return p; };
  const collar = arq("collar.csv", `HoleID;East;North;RL;Azimuth;Dip;Depth;Project\nFD-01;${X0};${Y0};600;0;-90;60;Lavra\nFD-02;${X0 + 40};${Y0};600;90;-60;80;Lavra\nFD-03;${X0 + 80};${Y0};600;;;30;Lavra\n`);
  const survey = arq("survey.csv", "hole_id;depth;azimuth;dip\nFD-02;0;90;-60\nFD-02;40;92;-58\nFD-02;80;95;-55\n");
  const geologia = arq("geologia.csv", "Furo;De;Até;Litologia;Alteração;Estruturas;Descrição\n" +
    "FD-01;0;12;Flogopita xisto;Flogopitização;S1 230/30;xisto foliado com flogopita\nFD-01;12;30;Anfibólio gnaisse;;;\nFD-01;30;60;Gnaisse pelítico;;;\n" +
    "FD-02;0;25;Anfibólio gnaisse;;;\nFD-02;25;80;Flogopita xisto;;;\n");
  let am = "furo;amostra;de;ate\n", laudo = "Amostra;Tipo;Cr (ppm);Be (ppm)\n";
  for (let i = 0; i < 10; i++) { am += `FD-01;BMT-TS-${500 + i};${i * 5};${i * 5 + 2}\n`; laudo += `BMT-TS-${500 + i};SMP;${i === 3 ? "<10" : 200 + i * 120};${2 + i}\n`; }
  for (let i = 0; i < 6; i++) { am += `FD-02;BMT-TS-${600 + i};${i * 10};${i * 10 + 3}\n`; laudo += `BMT-TS-${600 + i};SMP;${1500 - i * 150};${10 - i}\n`; }
  am += "FD-01;BMT-TS-599;55;65\n"; // passa do fundo (60 m): erro
  const amostras = arq("amostras.csv", am);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1050 }, acceptDownloads: true })).newPage();
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
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });
  const imp = await chamar("POST", `/minas/${mina.id}/laudos`, null, { nome: "laudo.csv", conteudo: laudo });
  await chamar("POST", `/importacoes/${imp.id}/confirmar-laudo`, { certificado: "C-SD-1" });

  // 1. Importação pela tela: prévia com erro e aviso; gravar só as linhas sem erro
  await page.goto(URL.replace(/\/$/, "") + "/geoop/sondagens");
  await page.getByText("Nenhum furo cadastrado").waitFor();
  await page.getByRole("button", { name: "Importar sondagem…" }).click();
  const dlg = page.getByRole("dialog");
  const inputs = dlg.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(collar);
  await inputs.nth(1).setInputFiles(survey);
  await inputs.nth(2).setInputFiles(geologia);
  await inputs.nth(3).setInputFiles(amostras);
  await dlg.getByRole("button", { name: "Ler e validar" }).click();
  await dlg.getByTestId("previa-furos").getByText("FD-02").waitFor();
  await dlg.getByText(/2 erro\(s\)/).waitFor(); // amostra além do fundo; FD-03 sem orientação nem survey
  await dlg.getByText(/BMT-TS-599|passa da profundidade final/).first().waitFor();
  await dlg.getByText(/FD-01: sem survey suficiente — trajetória será ESTIMADA/).waitFor();
  await shot("go5-01-previa");
  await dlg.getByRole("button", { name: "Gravar só as linhas sem erro" }).click();
  await page.getByText(/Gravados: 2 furo\(s\), 3 survey\(s\), 5 intervalo\(s\), 16 amostra\(s\) \(16 nova\(s\)\), 32 resultado\(s\) ligados\./).waitFor();

  // 2. Lista de furos e perfil por profundidade com tracks
  const lista = page.getByTestId("lista-furos");
  await lista.locator('tr[data-furo="FD-02"]').getByText("survey (3)").waitFor();
  await lista.locator('tr[data-furo="FD-01"]').getByText("estimada").waitFor();
  await page.getByRole("textbox", { name: "Analitos" }).click();
  for (const a of ["Cr (elemento)", "Be (elemento)"]) await page.getByRole("option", { name: a }).click();
  await page.keyboard.press("Escape");
  await lista.locator('tr[data-furo="FD-01"]').click();
  const perfil = page.getByTestId("perfil-FD-01");
  await perfil.locator('[data-track="Cr"]').waitFor();
  assert.deepStrictEqual(await perfil.locator("[data-track]").evaluateAll((g) => g.map((x) => x.getAttribute("data-track"))), ["litologia", "alteracao", "amostras", "Cr", "Be"]);
  await perfil.locator('[data-track="litologia"] [data-intervalo="0-12"]').waitFor();
  await perfil.locator('[data-valor="BMT-TS-503:<10"]').waitFor();
  await page.getByText("trajetória estimada").first().waitFor();
  await page.getByTestId("traj-planta").waitFor();
  await shot("go5-02-perfil");

  // 3. Clique na amostra → painel de contexto; clique no intervalo geológico → detalhes
  await perfil.locator('[data-track="amostras"] [data-amostra="BMT-TS-504"]').click();
  const ctxP = page.getByTestId("painel-contexto");
  await ctxP.getByText("BMT-TS-504", { exact: true }).waitFor();
  await ctxP.getByText(/FD-01 · 20[.,]?0?–22/).waitFor();
  await page.keyboard.press("Escape");
  await perfil.locator('[data-track="litologia"] [data-intervalo="0-12"]').click();
  await page.getByRole("dialog").getByText("xisto foliado com flogopita").waitFor();
  await page.getByRole("dialog").getByText(/Amostras neste intervalo: BMT-TS-500, BMT-TS-501, BMT-TS-502/).waitFor();
  await page.keyboard.press("Escape");

  // 4. Comparar furos lado a lado (mesma escala de profundidade e mesmas classes)
  await lista.locator('tr[data-furo="FD-02"]').click();
  await page.getByTestId("perfil-FD-02").locator('[data-track="Cr"]').waitFor();
  await page.getByText(/Profundidade 0[.,]0–80[.,]0 m \(mesma escala para todos os furos\)/).waitFor();
  const corFD1 = await page.getByTestId("perfil-FD-01").locator('[data-valor="BMT-TS-509:1280"] rect').first().getAttribute("fill");
  const corFD2 = await page.getByTestId("perfil-FD-02").locator('[data-valor="BMT-TS-601:1350"] rect').first().getAttribute("fill");
  assert.strictEqual(corFD1, corFD2, "1280 e 1350 ppm na mesma classe (classes comuns aos furos)");
  await shot("go5-03-comparacao");

  // 5. Zoom e seleção de intervalo em profundidade
  const caixa = await page.getByTestId("perfil-FD-01").boundingBox();
  await page.mouse.move(caixa.x + 200, caixa.y + 200);
  await page.mouse.wheel(0, -500);
  await page.getByText(/Profundidade (?!0[.,]0–80)/).waitFor();
  await page.getByRole("button", { name: "Furo inteiro" }).click();
  await page.getByText(/Profundidade 0[.,]0–80[.,]0 m/).waitFor();
  const c5 = await page.getByTestId("perfil-FD-01").boundingBox();
  await page.keyboard.down("Shift");
  const y = (m) => c5.y + 40 + (m / 80) * 620;
  await page.mouse.move(caixa.x + 300, y(0.5)); await page.mouse.down(); await page.mouse.move(caixa.x + 300, y(12), { steps: 6 }); await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.getByText(/Intervalo 0[.,]\d–1[12][.,]\d m: \d+ amostra\(s\)/).waitFor();
  await page.getByRole("button", { name: "Ampliar" }).click();

  // 6. Configurar track (barras) e exportar CSV
  await page.getByTestId("perfil-FD-01").locator('[data-track="Cr"] [data-cab]').click();
  await page.getByRole("dialog").getByText("Barras").click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Furo inteiro" }).click();
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Intervalos e resultados (CSV)" }).click()]);
  const csv = fs.readFileSync(await dl.path(), "utf-8").trim().split("\n");
  assert.strictEqual(csv.length, 1 + 16);
  assert.match(csv.find((l) => l.startsWith("FD-01;BMT-TS-503")), /;<10;/);

  assert.deepStrictEqual(erros, []);
  console.log("E2E GEOQUÍMICA OPERACIONAL (ETAPA 5 — SONDAGENS) OK: 6 cenários aprovados");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
