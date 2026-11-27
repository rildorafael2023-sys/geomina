// Percorre todas as telas com dados de exemplo e tira capturas (diagnóstico e revisão visual).
// Uso: node e2e/tour.cjs http://127.0.0.1:PORTA/ pasta_capturas [largura altura]
const { chromium } = require("playwright");
const assert = require("assert");
const [URL, CAPTURAS, LARG, ALT] = process.argv.slice(2);
const SENHA = "senhaForte123";
let errosG = [];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Number(LARG || 1440), height: Number(ALT || 900) } });
  const transb = [];
  const shot = async (n) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${CAPTURAS}/${n}.png` });
    const x = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (x > 1) transb.push(`${n}: +${x}px`);
  };
  const erros = errosG;
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  const chamar = (caminho, opcoes = {}) => page.evaluate(async ([c, o]) => {
    const h = { Authorization: "Bearer " + localStorage.getItem("geomina.token") };
    let body;
    if (o.form) { body = new FormData(); for (const [k, v] of Object.entries(o.form)) body.append(k, v); for (const [k, nome, txt] of o.arquivos ?? []) body.append(k, new Blob([txt], { type: "text/csv" }), nome); }
    else if (o.json) { h["Content-Type"] = "application/json"; body = JSON.stringify(o.json); }
    const r = await fetch("/api/v1" + c, { method: o.method ?? (body ? "POST" : "GET"), headers: h, body });
    return r.status === 204 ? null : r.json();
  }, [caminho, opcoes]);

  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await shot("00-instalacao");
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();
  const mina = await chamar("/minas", { json: { codigo: "MINA01", nome: "Mina Belmont", srid_trabalho: 31983 } });
  const un = async (tipo, codigo, nome, pai) => chamar("/unidades", { json: { mina_id: mina.id, tipo, codigo, nome, pai_id: pai?.id ?? null } });
  const n1 = await un("NIVEL", "N144", "Nível 144", null), n2 = await un("NIVEL", "N160", "Nível 160", null);
  const g1 = await un("GALERIA", "G144N", "Galeria 144 Norte", n1); await un("GALERIA", "G160S", "Galeria 160 Sul", n2);
  const t1 = await un("TRAVESSA", "1F5", "Travessa 1F5", n1); await un("TRAVESSA", "1F6", "Travessa 1F6", n1);
  const dics = await chamar("/dicionarios");
  const lito = (dics.find((d) => d.codigo === "litologia") ?? dics.find((d) => /lito/i.test(d.codigo)))?.termos ?? [];
  if (lito.length) {
    for (const [u, k] of [[t1, 0], [g1, 1]]) {
      const f = await chamar("/mapeamentos", { json: { unidade_id: u.id, data: "2026-11-20", descricao: "Frente mapeada no turno da manhã", intervalos: [
        { de_m: 0, ate_m: 1.5, litologia_id: lito[k % lito.length].id, descricao: "gnaisse bandado" }, { de_m: 1.5, ate_m: 3, litologia_id: lito[(k + 1) % lito.length].id, descricao: "xisto com flogopita" }] } });
      if (k === 0 && f?.id) await chamar(`/mapeamentos/${f.id}/submeter`, { json: {} });
    }
  }
  const campo = "Ponto;Direção da seção;Intervalo;Litologia;Descrição de campo;Data;Amostra\n" +
    "P-225;Travessa 1F5;0 m - 1 m;Gnaisse pelítico;gnaisse bandado;15/10/2026;BS-RP-225\n;Travessa 1F5;1 m - 2 m;Flogopita xisto;xisto com flogopita;15/10/2026;BS-RP-225\n" +
    ";Travessa 1F5;2 m - 3 m;Anfibólio gnaisse;não amostrado;;\n;Travessa 1F5;3 m - 4,5 m;Gnaisse pelítico;lapa;15/10/2026;BS-RP-226\n" +
    "P-226;Galeria 144 Norte;0 m - 1,2 m;Flogopita xisto;xisto;16/10/2026;BS-RP-227\n;Galeria 144 Norte;1,2 m - 2,5 m;Talco xisto;talco;16/10/2026;BS-RP-228\n";
  const p = await chamar(`/minas/${mina.id}/amostras/importacoes`, { form: {}, arquivos: [["arquivo", "campo.csv", campo]] });
  await chamar(`/importacoes/${p.id}/confirmar-amostras`, { json: {} });
  await chamar(`/minas/${mina.id}/amostras/ligar-unidade`, { json: { unidade_id: t1.id, local: "Travessa 1F5" } });
  const laudo = "Amostra;Tipo;Au (ppm);Cr (ppm);Be (ppm);Li (ppm);MgO (%);Fe2O3 (%);SiO2 (%)\n" +
    "BS-RP-225;SMP;0,12;519;4,2;35;12,5;8,1;52,3\nBS-RP-226;SMP;<0,01;<10;68,1;210;3;4,4;66,1\nBS-RP-227;SMP;0,05;1480;22;80;18;9;45\n";
  const lp = await chamar(`/minas/${mina.id}/laudos`, { form: {}, arquivos: [["arquivo", "laudo.csv", laudo]] });
  await chamar(`/importacoes/${lp.id}/confirmar-laudo`, { json: { certificado: "GQ2613496" } });
  // sondagem
  const geo = ["furo;de;ate;litologia;rqd;caixa;descricao"], am = ["furo;amostra;de;ate"], lab = ["Amostra;Tipo;Be (ppm);Cr (ppm);Li (ppm);MgO (%);Mo (ppm)"];
  const collar = ["furo;x;y;z;azimute;inclinacao;profundidade;area"];
  const L = [["Gnaisse pelítico", "gnaisse com pirita"], ["Flogopita xisto", "flogopitito com esmeralda"], ["Anfibólio gnaisse", "anfibólio gnaisse com calcita"], ["Talco xisto", "talco xisto"]];
  for (const [c, prof, d] of [["F310", 40, 0], ["F311", 36, 1], ["F312", 30, 2]]) {
    collar.push([c, 500000 + d * 50, 7800000, 600, 0, -90, prof, "baixada"].join(";"));
    geo.push([c, 0, 3, "Solo", "", "", "solo argiloso"].join(";"));
    for (let a = 3, k = 0; a < prof; a += 4, k++) geo.push([c, a, Math.min(prof, a + 4), L[(k + d) % 4][0], (k * 29 + d * 7) % 100, Math.floor(a / 5) + 1, L[(k + d) % 4][1]].join(";"));
    for (let s = 6, n = 1; s < prof - 2; s += 1.5, n++) { const cod = `BMT-${c}-${n}`; am.push([c, cod, String(s).replace(".", ","), String(s + 1.5).replace(".", ",")].join(";")); const z = Math.sin(s / 4 + d) + 1.3; lab.push([cod, "SMP", (z * 40).toFixed(1).replace(".", ","), Math.round(z * 900), Math.round(30 + z * 50), (6 + z * 5).toFixed(1).replace(".", ","), (z * 5).toFixed(1).replace(".", ",")].join(";")); }
  }
  const sp = await chamar(`/minas/${mina.id}/sondagem/importacoes`, { form: { srid: "31983" }, arquivos: [["collar", "c.csv", collar.join("\n")], ["geologia", "g.csv", geo.join("\n")], ["amostras", "a.csv", am.join("\n")]] });
  await chamar(`/importacoes/${sp.id}/confirmar-sondagem`, { json: { ignorar_erros: true } });
  const lp2 = await chamar(`/minas/${mina.id}/laudos`, { form: {}, arquivos: [["arquivo", "l2.csv", lab.join("\n")]] });
  await chamar(`/importacoes/${lp2.id}/confirmar-laudo`, { json: { certificado: "GQ2611017" } });

  const rotas = [["01-painel", "/"], ["02-estrutura", "/estrutura"], ["03-mapeamento", "/mapeamento"], ["04-mapeamento-nova", "/mapeamento/nova"], ["05-amostras", "/amostras"],
    ["07-sondagem-perfil", "/sondagem"], ["08-sondagem-amostragem", "/sondagem/amostragem"], ["09-sondagem-fotos", "/sondagem/fotos"], ["10-sondagem-tracks", "/sondagem/tracks"],
    ["11-sondagem-furos", "/sondagem/furos"], ["12-laboratorio", "/geoquimica"], ["13-topografia", "/topografia"], ["14-relatorios", "/relatorios"], ["15-documentos", "/documentos"],
    ["16-dicionarios", "/dicionarios"], ["17-tipos", "/configuracao/estrutura"], ["18-usuarios", "/usuarios"], ["19-auditoria", "/auditoria"], ["20-backup", "/backup"], ["21-sistema", "/sistema"], ["22-senha", "/senha"]];
  for (const [n, r] of rotas) { await page.goto(URL.replace(/\/$/, "") + r); await page.waitForLoadState("networkidle"); await shot(n); }
  // detalhes
  await page.goto(URL.replace(/\/$/, "") + "/amostras"); await page.waitForLoadState("networkidle");
  await page.getByRole("cell", { name: "BS-RP-225" }).first().click(); await shot("06-amostras-perfil-frente");
  await page.goto(URL.replace(/\/$/, "") + "/estrutura"); await page.waitForLoadState("networkidle");
  await page.getByText("Travessa 1F5").first().click().catch(() => {}); await shot("02b-estrutura-detalhe");
  await page.goto(URL.replace(/\/$/, "") + "/mapeamento"); await page.waitForLoadState("networkidle");
  await page.getByRole("cell", { name: /1F5/ }).first().click().catch(() => {}); await shot("03b-mapeamento-ficha");
  await page.goto(URL.replace(/\/$/, "") + "/sondagem/furos"); await page.waitForLoadState("networkidle");
  await page.getByRole("cell", { name: "F310" }).click(); await shot("11b-sondagem-log");
  console.log("OK — tour", lito.length ? "" : "(sem dicionário de litologia)", "erros:", erros.length);
  console.log("Rolagem horizontal:", transb.length ? transb.join(" | ") : "nenhuma");
  if (erros.length) console.log(erros.slice(0, 5).join("\n"));
  await browser.close();
})().catch((e) => { console.error(e.message.slice(0, 400)); console.error(errosG.slice(0, 5)); process.exit(1); });
