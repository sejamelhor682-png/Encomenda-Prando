const C = window.CONFIG;
const DEMO = !C.SUPABASE_URL || !C.SUPABASE_ANON_KEY;
const $ = s => document.querySelector(s);
const ROT = { kg: ["kg", "kg"], g: ["g", "g"], un: ["unidade", "unidades"], pote: ["pote", "potes"], pacote: ["pacote", "pacotes"], litro: ["litro", "litros"] };
const rot = (u, q = 2) => (ROT[u] ? ROT[u][q === 1 ? 0 : 1] : u);
const U = (u, p) => [{ unidade: u, preco: p }];
const DEMO_PRODUTOS = [
  { id: 1, nome: "Paleta", unidades: U("kg", 20) },
  { id: 2, nome: "Costela", unidades: U("kg", 23) },
  { id: 3, nome: "Linguiça fina", unidades: [{ unidade: "kg", preco: 20 }, { unidade: "pacote", preco: 20 }] },
  { id: 4, nome: "Torresmo", unidades: U("pacote", 12) },
  { id: 5, nome: "Banha", unidades: U("litro", 25) }
];
const brl = n => n.toFixed(2).replace(".", ",");
const fq = q => String(q).replace(".", ",");
const esc = t => { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; };
const passo = u => (u === "kg" ? 0.5 : 1);
const preco = (p, u) => Number(p.unidades.find(x => x.unidade === u).preco);
let produtos = [], cart = {}, dia = null, pedido = null, ultimoNumero = "";

async function rpc(fn, args) {
  const r = await fetch(`${C.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY }, body: JSON.stringify(args || {})
  });
  if (!r.ok) { let m = "Não foi possível concluir. Tente de novo."; try { m = (await r.json()).message || m; } catch (e) {} throw new Error(m); }
  return r.json();
}
function ir(n) { [1, 2, 3, 4].forEach(i => ($("#p" + i).hidden = i !== n)); window.scrollTo(0, 0); }
function erro(id, msg) { const e = $(id); e.textContent = msg || ""; e.hidden = !msg; }

function cardHTML(p) {
  const c = cart[p.id];
  let h = `<article class="prod${c ? " on" : ""}" data-id="${p.id}"><div class="topo"><h3>${esc(p.nome)}</h3>`;
  if (p.unidades.length === 1) h += `<span class="preco">R$ ${brl(Number(p.unidades[0].preco))} o ${rot(p.unidades[0].unidade, 1)}</span>`;
  h += "</div>";
  if (!c) return h + `<button class="add" data-add="1">Quero este</button></article>`;
  if (p.unidades.length > 1) h += `<div class="chips" role="group" aria-label="Como você quer comprar">` + p.unidades.map(x => `<button class="chip${x.unidade === c.u ? " sel" : ""}" data-un="${x.unidade}">Por ${rot(x.unidade, 1)}<br>R$ ${brl(Number(x.preco))}</button>`).join("") + "</div>";
  return h + `<div class="qtd"><button data-m="1" aria-label="Diminuir ${esc(p.nome)}">−</button><output aria-live="polite">${fq(c.q)} ${rot(c.u, c.q)}</output><button data-p="1" aria-label="Aumentar ${esc(p.nome)}">+</button></div></article>`;
}
function total() { return produtos.reduce((s, p) => s + (cart[p.id] ? cart[p.id].q * preco(p, cart[p.id].u) : 0), 0); }
function barra() {
  const n = Object.keys(cart).length;
  $("#tot").textContent = n ? `Total estimado: R$ ${brl(total())}` : "Escolha os produtos";
  $("#cont1").disabled = !n;
}
$("#lista").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const card = b.closest("article"), p = produtos.find(x => x.id == card.dataset.id), c = cart[p.id];
  if (b.dataset.add) cart[p.id] = { u: p.unidades[0].unidade, q: passo(p.unidades[0].unidade) };
  else if (b.dataset.un) cart[p.id] = { u: b.dataset.un, q: passo(b.dataset.un) };
  else if (b.dataset.p) c.q = Math.min(99, c.q + passo(c.u));
  else if (b.dataset.m) { c.q -= passo(c.u); if (c.q <= 0) delete cart[p.id]; }
  card.outerHTML = cardHTML(p); barra();
};
$("#cont1").onclick = () => ir(2);

// Datas das próximas feiras (fuso de São Paulo)
function feiras() {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
  const g = {}; f.formatToParts(new Date()).forEach(x => (g[x.type] = x.value));
  const y = +g.year, m = +g.month, d = +g.day, dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let off = (C.FEIRA_DIA - dow + 7) % 7;
  if (off === 0 && +g.hour >= C.FEIRA_FIM_HORA) off = 7;
  return [0, 1, 2].map(k => {
    const dt = new Date(Date.UTC(y, m - 1, d + off + 7 * k));
    const dd = String(dt.getUTCDate()).padStart(2, "0"), mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const nome = k === 0 ? (off === 0 ? "Hoje" : off >= 7 ? "Sábado que vem" : "Este sábado") : "Sábado";
    return { iso: dt.toISOString().slice(0, 10), txt: `${nome}, ${dd}/${mm}` };
  });
}
function desenhaDias() {
  $("#dias").innerHTML = feiras().map((x, i) => { if (i === 0 && !dia) dia = x.iso; return `<button class="dia${x.iso === dia ? " sel" : ""}" data-d="${x.iso}" data-t="${x.txt}">${x.txt}</button>`; }).join("");
}
$("#dias").onclick = e => { const b = e.target.closest("button"); if (!b) return; dia = b.dataset.d; document.querySelectorAll(".dia").forEach(x => x.classList.toggle("sel", x === b)); };

document.querySelectorAll(".volta").forEach(b => (b.onclick = () => ir(+b.dataset.volta)));
$("#cont2").onclick = () => {
  if ($("#site").value) return;
  const nome = $("#nome").value.trim().replace(/\s+/g, " "), apelido = $("#apelido").value.trim().replace(/\s+/g, " "), tel = $("#tel").value.replace(/\D/g, "");
  const ps = nome.split(" ");
  if (ps.length < 2 || ps[0].length < 2 || ps[ps.length - 1].length < 2) return erro("#erro2", "Digite o nome completo: nome e sobrenome.");
  const nomeFinal = apelido && apelido.toLowerCase() !== nome.toLowerCase() ? `${nome} (${apelido})` : nome;
  if (C.TELEFONE_OBRIGATORIO && !tel) return erro("#erro2", "Informe um telefone.");
  if (tel && (tel.length < 10 || tel.length > 13)) return erro("#erro2", "Telefone incompleto. Digite com o DDD, ou deixe em branco.");
  erro("#erro2");
  const itens = produtos.filter(p => cart[p.id]).map(p => ({ produto_id: p.id, quantidade: cart[p.id].q, unidade: cart[p.id].u, nome: p.nome, valor: cart[p.id].q * preco(p, cart[p.id].u) }));
  if (!itens.length) return ir(1);
  const diaTxt = (document.querySelector(".dia.sel") || {}).dataset ? document.querySelector(".dia.sel").dataset.t : "";
  pedido = { nome: nomeFinal, tel, dia, diaTxt, obs: $("#obs").value.trim(), itens };
  $("#resumo").innerHTML = `<p><strong>${esc(nomeFinal)}</strong>${tel ? "<br>" + esc($("#tel").value) : ""}<br>Retirada: ${esc(diaTxt)}</p>` + lista(itens) + (pedido.obs ? `<p>Recado: ${esc(pedido.obs)}</p>` : "");
  ir(3);
};
function lista(itens) {
  return "<ul>" + itens.map(i => `<li><strong>${esc(i.nome)}</strong>: ${fq(i.quantidade)} ${rot(i.unidade, i.quantidade)} (R$ ${brl(i.valor)})</li>`).join("") + `</ul><p><strong>Total estimado: R$ ${brl(itens.reduce((s, i) => s + i.valor, 0))}</strong><br><small>Valor final confirmado na barraca.</small></p>`;
}
function contato() {
  const t = String(C.TELEFONE_BARRACA || "").replace(/\D/g, ""), e = $("#contato");
  if (t.length < 10) { e.hidden = true; return; }
  const f = t.length >= 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7, 11)}` : `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6, 10)}`;
  e.innerHTML = `Precisa falar com a gente? Ligue ou chame no WhatsApp:<br><strong>${f}</strong><br><a href="tel:+55${t}">Ligar</a> · <a href="https://wa.me/55${t}" target="_blank" rel="noopener">WhatsApp</a>`;
  e.hidden = false;
}
const seguro = u => /^https:\/\//.test(u || "");
function local() {
  const n = (C.LOCAL_NOME || "").trim(), m = (C.LOCAL_MAPS_URL || "").trim(), e = $("#local");
  if (!n && !seguro(m)) { e.hidden = true; return; }
  e.innerHTML = `<strong>📍 Onde nos encontrar</strong>${n ? "<br>" + esc(n) : ""}<br>Sábados, das 3h às 11h30` + (seguro(m) ? `<br><a href="${esc(m).replace(/"/g, "&quot;")}" target="_blank" rel="noopener">Abrir no mapa</a>` : "");
  e.hidden = false;
}
const carrega = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
async function gerarComprovante() {
  const W = 800, P = 52, c0 = document.createElement("canvas"); c0.width = W; c0.height = 3200;
  const x = c0.getContext("2d"); x.fillStyle = "#fcf3e7"; x.fillRect(0, 0, W, 3200);
  let y = P;
  try { const im = await carrega("logo-vertical.png"), w = 300, h = im.height * w / im.width; x.drawImage(im, (W - w) / 2, y, w, h); y += h + 18; } catch (e) {}
  const txt = (t, o = {}) => {
    const s = o.s || 28; x.font = `${o.b ? "bold " : ""}${s}px ${o.f || "system-ui, Arial, sans-serif"}`; x.fillStyle = o.c || "#2a1717"; x.textAlign = o.a || "left";
    const mx = W - 2 * P, ax = o.a === "center" ? W / 2 : P; let l = "";
    const fl = () => { x.fillText(l, ax, y + s); y += s * 1.4; };
    for (const w of String(t).split(" ")) { const t2 = l ? l + " " + w : w; if (x.measureText(t2).width > mx && l) { fl(); l = w; } else l = t2; }
    if (l) fl(); y += o.g || 0;
  };
  const linha = () => { x.fillStyle = "#d9c3ae"; x.fillRect(P, y, W - 2 * P, 3); y += 22; };
  txt("Comprovante de pedido", { b: true, s: 40, a: "center", c: "#8c1518", f: "Georgia, serif", g: 4 });
  txt("Pedido nº " + ultimoNumero, { b: true, s: 56, a: "center", c: "#1f6b4a", g: 6 });
  txt("Feito em " + new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }), { s: 24, a: "center", c: "#6b5656", g: 14 });
  linha(); txt("Cliente: " + pedido.nome, { b: true }); txt("Retirada: " + pedido.diaTxt, { g: 8 }); linha();
  let tot = 0;
  pedido.itens.forEach(i => { tot += i.valor; txt(`${i.nome}: ${fq(i.quantidade)} ${rot(i.unidade, i.quantidade)} (R$ ${brl(i.valor)})`); });
  y += 4; linha(); txt("Total estimado: R$ " + brl(tot), { b: true, s: 34 }); txt("Valor final confirmado na barraca.", { s: 22, c: "#6b5656", g: 10 });
  const n = (C.LOCAL_NOME || "").trim(), t = String(C.TELEFONE_BARRACA || "").replace(/\D/g, "");
  if (n || t.length >= 10) linha();
  if (n) txt("Local: " + n, { s: 26 });
  txt("Sábados, das 3h às 11h30", { s: 26, g: 4 });
  if (t.length >= 10) txt("Contato: " + (t.length >= 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7, 11)}` : `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6, 10)}`), { s: 26, g: 10 });
  y += 8; txt("Obrigado pela preferência!", { b: true, s: 30, a: "center", c: "#8c1518", f: "Georgia, serif" });
  const out = document.createElement("canvas"); out.width = W; out.height = Math.ceil(y + P);
  out.getContext("2d").drawImage(c0, 0, 0, W, out.height, 0, 0, W, out.height);
  return new Promise(r => out.toBlob(r, "image/png"));
}
let blobAtual = null, urlAtual = "";
function fechaComp() { $("#comp").hidden = true; if (urlAtual) URL.revokeObjectURL(urlAtual); urlAtual = ""; $("#compimg").removeAttribute("src"); }
$("#baixar").onclick = async function () {
  this.disabled = true; erro("#erro4");
  try {
    const b = await gerarComprovante(); if (!b) throw new Error("vazio");
    blobAtual = b; if (urlAtual) URL.revokeObjectURL(urlAtual); urlAtual = URL.createObjectURL(b);
    $("#compimg").src = urlAtual; $("#compbaixar").href = urlAtual; $("#compbaixar").download = `comprovante-pedido-${ultimoNumero}.png`;
    $("#comp").hidden = false;
  } catch (e) { erro("#erro4", "Não foi possível gerar o comprovante. Tire um print desta tela para guardar o número do pedido."); }
  this.disabled = false;
};
$("#fechar").onclick = fechaComp;
$("#compartilhar").onclick = async () => { try { await navigator.share({ files: [new File([blobAtual], `comprovante-pedido-${ultimoNumero}.png`, { type: "image/png" })], title: "Comprovante do pedido" }); } catch (e) {} };
try { if (navigator.canShare && navigator.canShare({ files: [new File([""], "a.png", { type: "image/png" })] })) $("#compartilhar").hidden = false; } catch (e) {}
$("#home").onclick = e => { e.preventDefault(); if (!$("#p4").hidden) $("#nova").click(); else if ($("#p1").hidden) ir(1); else window.scrollTo(0, 0); };
$("#confirmar").onclick = async function () {
  this.disabled = true; erro("#erro3");
  try {
    let numero = "DEMO";
    if (!DEMO) {
      const r = await rpc("criar_encomenda", { p_nome: pedido.nome, p_telefone: pedido.tel || null, p_retirada: pedido.dia || null, p_obs: pedido.obs || null, p_itens: pedido.itens.map(i => ({ produto_id: i.produto_id, quantidade: i.quantidade, unidade: i.unidade })) });
      numero = r.numero;
    }
    $("#numero").textContent = numero; $("#obg").textContent = "Obrigado pelo seu pedido, " + pedido.nome.split(" ")[0] + "!"; contato(); ultimoNumero = numero; $("#resumo2").innerHTML = `<p>Retirada: <strong>${esc(pedido.diaTxt)}</strong></p>` + lista(pedido.itens); local(); ir(4);
  } catch (x) { erro("#erro3", x.message); }
  this.disabled = false;
};
$("#nova").onclick = () => { cart = {}; dia = null; $("#apelido").value = ""; $("#nome").value = $("#tel").value = $("#obs").value = ""; $("#lista").innerHTML = produtos.map(cardHTML).join(""); desenhaDias(); barra(); ir(1); };

(async function init() {
  $("#titulo").textContent = C.NOME_BARRACA || "Encomendas";
  try { produtos = DEMO ? DEMO_PRODUTOS : await rpc("listar_produtos"); }
  catch (x) { return erro("#erro1", "Não foi possível carregar os produtos. Recarregue a página."); }
  $("#demo").hidden = !DEMO;
  if (!produtos.length) return erro("#erro1", "Nenhum produto disponível no momento.");
  $("#lista").innerHTML = produtos.map(cardHTML).join(""); desenhaDias(); barra();
})();
