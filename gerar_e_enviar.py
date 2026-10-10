"""Gera o PDF de encomendas da próxima feira e envia pelo Telegram. Roda no GitHub Actions."""
import io, os, sys, time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

SP = ZoneInfo("America/Sao_Paulo")
NOME = os.environ.get("NOME_BARRACA", "Barraca do Prando")
ATIVOS = {"pendente", "confirmado", "separado"}
PACOTE_KG = {"Linguiça grossa": 1, "Linguiça fina": 1, "Chouriço": 1, "Escudiguim": 1}  # kg por pacote
ROT = {"kg": ("kg", "kg"), "g": ("g", "g"), "un": ("unidade", "unidades"), "pote": ("pote", "potes"), "pacote": ("pacote", "pacotes"), "litro": ("litro", "litros")}
rot = lambda u, q: ROT.get(u, (u, u))[0 if float(q) == 1 else 1]
fq = lambda q: ("%g" % float(q)).replace(".", ",")
dbr = lambda iso: "/".join(reversed(iso.split("-"))) if iso else "sem data"

def feira_alvo(hoje):  # próximo sábado (ou hoje, se for sábado)
    return hoje + timedelta(days=(5 - hoje.weekday()) % 7)

def selecionar(pedidos, alvo):
    a = alvo.isoformat()
    validos = [p for p in pedidos if p["status"] in ATIVOS and (not p.get("retirada") or p["retirada"] <= a)]
    cancel = [p for p in pedidos if p["status"] == "cancelado" and p.get("retirada") == a]
    return validos, cancel

def totais(validos):
    t = {}
    for p in validos:
        for i in p["itens_encomenda"]:
            k = (i["nome_produto"], i["unidade"]); t[k] = t.get(k, 0) + float(i["quantidade"])
    return sorted(t.items())

def equivalencias(validos):
    t = dict(totais(validos)); r = []
    for nome, kg in PACOTE_KG.items():
        if t.get((nome, "pacote")):
            r.append((nome, t.get((nome, "kg"), 0) + t[(nome, "pacote")] * kg))
    return r

def resumo_texto(validos, cancel, alvo):
    L = [f"📋 {NOME}", f"Encomendas para a feira de {alvo.strftime('%d/%m/%Y')}", "",
         f"Pedidos ativos: {len(validos)}", f"Clientes: {len({(p['nome'].lower(), p.get('telefone')) for p in validos})}"]
    if cancel: L.append(f"Cancelados (fora dos totais): {len(cancel)}")
    L.append("")
    if not validos: L.append("Nenhuma encomenda para esta feira.")
    else: L.append("TOTAL A LEVAR PARA A FEIRA:")
    for (n, u), q in totais(validos): L.append(f"• {n}: {fq(q)} {rot(u, q)}")
    for n, kg in equivalencias(validos): L.append(f"  ↳ {n} somando kg e pacotes: {fq(kg)} kg")
    L += ["", "O PDF completo está no arquivo a seguir."]
    return "\n".join(L)

def montar_pdf(validos, cancel, alvo, agora):
    ss = getSampleStyleSheet(); n = ss["BodyText"]; h1 = ss["Title"]; h2 = ss["Heading2"]
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=1.8*cm, rightMargin=1.8*cm, topMargin=1.6*cm, bottomMargin=1.6*cm, title=f"Encomendas {alvo.isoformat()}")
    E = [Paragraph(escape(NOME), h1), Paragraph(f"<b>Encomendas para a feira de {alvo.strftime('%d/%m/%Y')}</b>", n),
         Paragraph(f"Gerado em {agora.strftime('%d/%m/%Y %H:%M')} (horário de Brasília). Período: pedidos ativos com retirada até {alvo.strftime('%d/%m/%Y')}.", n), Spacer(1, 8),
         Paragraph("Total a levar para a feira (soma de todos os clientes)", h2),
         Paragraph(f"Clientes: <b>{len({(p['nome'].lower(), p.get('telefone')) for p in validos})}</b> &nbsp; Pedidos ativos: <b>{len(validos)}</b>" + (f" &nbsp; Cancelados (fora dos totais): {len(cancel)}" if cancel else ""), n)]
    if not validos:
        E.append(Paragraph("<b>Nenhuma encomenda para esta feira.</b>", n))
    else:
        rows = [["Produto", "Levar para a feira"]] + [[n_, f"{fq(q)} {rot(u, q)}"] for (n_, u), q in totais(validos)]
        t = Table(rows, colWidths=[10*cm, 6*cm], repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#a61e3c")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 13),
            ("GRID", (0, 0), (-1, -1), .5, colors.HexColor("#b9a9ad")), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f1f1")]),
            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
        eq = "".join(f"{escape(a)} somando kg e pacotes de 1 kg: <b>{fq(b)} kg</b><br/>" for a, b in equivalencias(validos))
        E += [Spacer(1, 6), t, Spacer(1, 6)] + ([Paragraph(eq, n)] if eq else []) + [Paragraph("<font size=8>Kg, pacotes, litros e unidades nunca são somados entre si.</font>", n), Paragraph("Pedidos de cada cliente (para separar)", h2)]
        for p in sorted(validos, key=lambda x: x["id"]):
            b = [Paragraph(f"<b>Pedido #{p['id']} – {escape(p['nome'])}</b>", n),
                 Paragraph(f"Tel.: {escape(p.get('telefone') or 'não informado')} &nbsp; Retirada: {dbr(p.get('retirada'))} &nbsp; Status: {p['status']}", n)]
            for i in p["itens_encomenda"]:
                b.append(Paragraph(f"&nbsp;&nbsp;• {escape(i['nome_produto'])}: <b>{fq(i['quantidade'])} {rot(i['unidade'], i['quantidade'])}</b>", n))
            if p.get("obs"): b.append(Paragraph(f"<i>Recado: {escape(p['obs'])}</i>", n))
            b.append(Spacer(1, 8)); E.append(KeepTogether(b))
    doc.build(E)
    return buf.getvalue()

def main():
    import requests
    env = {k: os.environ.get(k, "") for k in ["SUPABASE_URL", "SUPABASE_KEY", "ROBO_EMAIL", "ROBO_SENHA", "TELEGRAM_TOKEN", "TELEGRAM_CHAT_ID"]}
    falta = [k for k, v in env.items() if not v]
    if falta: sys.exit("Faltam configurações (Secrets): " + ", ".join(falta))
    agora = datetime.now(SP); alvo = feira_alvo(agora.date())
    H = {"apikey": env["SUPABASE_KEY"], "Content-Type": "application/json"}
    r = requests.post(env["SUPABASE_URL"] + "/auth/v1/token?grant_type=password", headers=H, json={"email": env["ROBO_EMAIL"], "password": env["ROBO_SENHA"]}, timeout=30)
    if not r.ok: sys.exit("Falha no login do robô no Supabase (confira e-mail e senha).")
    H["Authorization"] = "Bearer " + r.json()["access_token"]
    def log(status, detalhe):
        requests.post(env["SUPABASE_URL"] + "/rest/v1/relatorios_envios", headers={**H, "Prefer": "resolution=merge-duplicates"},
                      json={"semana": alvo.isoformat(), "status": status, "detalhe": detalhe, "enviado_em": datetime.utcnow().isoformat() + "Z"}, timeout=30)
    ja = requests.get(env["SUPABASE_URL"] + f"/rest/v1/relatorios_envios?semana=eq.{alvo.isoformat()}&status=eq.enviado", headers=H, timeout=30)
    if ja.ok and ja.json() and os.environ.get("FORCAR") != "1":
        print("Relatório desta semana já foi enviado. Nada a fazer."); return
    try:
        rr = requests.get(env["SUPABASE_URL"] + "/rest/v1/encomendas?select=*,itens_encomenda(*)&order=id.asc&limit=1000", headers=H, timeout=60)
        rr.raise_for_status()
        validos, cancel = selecionar(rr.json(), alvo)
        pdf = montar_pdf(validos, cancel, alvo, agora)
        def tg(metodo, **kw):
            err = ""
            for t in range(3):
                try:
                    x = requests.post(f"https://api.telegram.org/bot{env['TELEGRAM_TOKEN']}/{metodo}", timeout=60, **kw)
                    if x.ok: return
                    err = f"HTTP {x.status_code}"
                except Exception as e: err = type(e).__name__  # sem texto da exceção: poderia conter o token
                time.sleep(5 * (t + 1))
            raise RuntimeError("Telegram: " + err)
        tg("sendMessage", data={"chat_id": env["TELEGRAM_CHAT_ID"], "text": resumo_texto(validos, cancel, alvo)})
        tg("sendDocument", data={"chat_id": env["TELEGRAM_CHAT_ID"]}, files={"document": (f"encomendas-{alvo.isoformat()}.pdf", pdf, "application/pdf")})
        log("enviado", f"{len(validos)} pedidos ativos")
        print("Relatório enviado.")
    except Exception as e:
        try: log("erro", type(e).__name__ + ": " + str(e)[:150].replace(env["TELEGRAM_TOKEN"], "***"))
        except Exception: pass
        sys.exit("Falha ao gerar/enviar o relatório: " + type(e).__name__)

if __name__ == "__main__":
    main()
