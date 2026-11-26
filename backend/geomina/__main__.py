"""Inicia o GeoMina no computador local: `python -m geomina` (ou o atalho da área de trabalho)."""

from __future__ import annotations

import argparse
import logging
import logging.handlers
import socket
import sys
import threading
import time
from pathlib import Path

import uvicorn

from geomina.config import VERSAO_APP, Config
from geomina.janela import abrir_interface, avisar_erro, instancia_existente


def _porta_livre(host: str, preferida: int) -> int:
    for porta in [preferida, *range(preferida + 1, preferida + 20)]:
        with socket.socket() as s:
            try:
                s.bind((host, porta))
                return porta
            except OSError:
                continue
    raise RuntimeError("Nenhuma porta local disponível (8765 a 8784).")


def _configurar_log(cfg: Config) -> None:
    pasta = cfg.dados / "logs"
    pasta.mkdir(parents=True, exist_ok=True)
    manipuladores: list[logging.Handler] = [
        logging.handlers.RotatingFileHandler(pasta / "geomina.log", maxBytes=2_000_000, backupCount=3,
                                             encoding="utf-8")
    ]
    if sys.stderr is not None:  # com pythonw.exe (atalho) não há console
        manipuladores.append(logging.StreamHandler())
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s",
                        handlers=manipuladores, force=True)


def main() -> None:
    p = argparse.ArgumentParser(prog="geomina", description="GeoMina — aplicativo local")
    p.add_argument("--dados", type=Path, help="pasta de dados (banco, arquivos, backups)")
    p.add_argument("--porta", type=int, help="porta local (padrão 8765)")
    p.add_argument("--sem-navegador", action="store_true", help="não abrir a interface")
    p.add_argument("--aba", action="store_true", help="abrir numa aba do navegador padrão em vez de janela própria")
    args = p.parse_args()

    extras = {k: v for k, v in {"dados": args.dados, "porta": args.porta}.items() if v is not None}
    cfg = Config(**extras)
    cfg.preparar_pastas()
    _configurar_log(cfg)
    log = logging.getLogger("geomina")

    try:
        existente = instancia_existente(cfg.host, cfg.porta, cfg.dados)
        if existente:
            log.info("GeoMina já está aberto em %s; abrindo outra janela", existente)
            if not args.sem_navegador:
                abrir_interface(existente, cfg.dados, preferir_janela=not args.aba)
            return

        cfg.porta = _porta_livre(cfg.host, cfg.porta)
        from geomina.main import criar_app

        app = criar_app(cfg)
    except Exception as e:  # erro antes de existir interface: mostrar ao usuário
        logging.getLogger("geomina").exception("Falha ao iniciar")
        avisar_erro(f"O GeoMina não conseguiu iniciar:\n\n{e}\n\nDetalhes em {cfg.dados / 'logs' / 'geomina.log'}")
        sys.exit(1)

    url = f"http://{cfg.host}:{cfg.porta}/"
    print(f"\nGeoMina {VERSAO_APP} — dados em {cfg.dados}\nEndereço: {url}\n")
    servidor = uvicorn.Server(uvicorn.Config(app, host=cfg.host, port=cfg.porta, log_config=None,
                                             log_level="warning"))
    presenca = app.state.presenca

    def _abrir_quando_pronto() -> None:
        while not servidor.started:
            time.sleep(0.1)
        if args.sem_navegador:
            return
        modo = abrir_interface(url, cfg.dados, preferir_janela=not args.aba)
        # Com janela própria, fechar a última janela encerra o aplicativo.
        presenca.ativo = modo == "janela"
        if not presenca.ativo:
            print("Aberto no navegador. Feche esta janela para encerrar o GeoMina.")

    def _vigiar_presenca() -> None:
        while not servidor.should_exit:
            if presenca.deve_encerrar():
                log.info("Nenhuma janela do GeoMina aberta; encerrando")
                servidor.should_exit = True
            time.sleep(2)

    def _preparar_consultas() -> None:
        # monta em segundo plano a base da Geoquímica operacional (em minas grandes leva alguns segundos)
        try:
            from sqlalchemy import select

            from geomina.modules.estrutura.models import Mina
            from geomina.modules.geoop.servico import registros
            with app.state.fabrica_sessoes() as db:
                for mina_id in db.scalars(select(Mina.id)).all():
                    registros(db, mina_id)
        except Exception:  # noqa: BLE001 — só desempenho; a consulta monta a base quando for pedida
            log.exception("Falha ao preparar a base da geoquímica")

    threading.Thread(target=_abrir_quando_pronto, daemon=True).start()
    threading.Thread(target=_preparar_consultas, daemon=True).start()
    threading.Thread(target=_vigiar_presenca, daemon=True).start()
    servidor.run()


if __name__ == "__main__":
    main()
