"""Geoquímica: laboratórios, métodos, analitos (lista aberta), certificados e resultados (Etapa 9).

Cada resultado guarda o valor original como texto, o número, o qualificador (<, >, N.A., --) e o
limite. Resultados de códigos ainda não cadastrados ficam guardados (sem vínculo) e podem ser
vinculados depois. Linhas de controle do laboratório (DUP, REP, STD) nunca são "preferidas".
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from geomina.db import Base, DataHoraUTC, EntidadeMixin


class Laboratorio(EntidadeMixin, Base):
    __tablename__ = "laboratorio"
    __auditavel__ = True
    codigo: Mapped[str] = mapped_column(String(30, collation="NOCASE"), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)


class MetodoAnalitico(EntidadeMixin, Base):
    __tablename__ = "metodo_analitico"
    __auditavel__ = True
    __table_args__ = (UniqueConstraint("laboratorio_id", "codigo", name="laboratorio_metodo"),)
    laboratorio_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("laboratorio.id", ondelete="RESTRICT"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(40, collation="NOCASE"), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String(200))


class Analito(EntidadeMixin, Base):
    __tablename__ = "analito"
    __auditavel__ = True
    __table_args__ = (CheckConstraint("tipo IN ('elemento','oxido','parametro')", name="tipo_valido"),)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)  # sensível a maiúsculas (Co ≠ CO)
    nome: Mapped[str | None] = mapped_column(String(80))
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class Certificado(EntidadeMixin, Base):
    __tablename__ = "certificado"
    __auditavel__ = True
    __table_args__ = (UniqueConstraint("laboratorio_id", "codigo", name="laboratorio_certificado"),)
    laboratorio_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("laboratorio.id", ondelete="RESTRICT"), nullable=False)
    mina_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("mina.id", ondelete="RESTRICT"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(40, collation="NOCASE"), nullable=False)  # ex.: GQ2613496
    emitido_em: Mapped[datetime | None] = mapped_column(DataHoraUTC())
    cliente: Mapped[str | None] = mapped_column(String(120))
    referencia: Mapped[str | None] = mapped_column(String(120))
    projeto: Mapped[str | None] = mapped_column(String(120))
    importacao_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("importacao.id", ondelete="RESTRICT"), nullable=False)


class Resultado(Base):
    __tablename__ = "resultado"
    __auditavel__ = False  # milhares de linhas por laudo: rastreados pela importação (arquivo original + relatório)
    __table_args__ = (
        CheckConstraint("qualificador IN ('=','<','>','NA','--')", name="qualificador_valido"),
        CheckConstraint("qualificador <> '=' OR valor_num IS NOT NULL", name="valor_obrigatorio"),
        CheckConstraint("tipo_linha IN ('SMP','DUP','REP','STD','BLK')", name="tipo_linha_valido"),
        CheckConstraint("NOT preferido OR (tipo_linha = 'SMP' AND amostra_id IS NOT NULL)", name="preferido_so_smp"),
        UniqueConstraint("certificado_id", "tipo_linha", "codigo_laboratorio", "analito_id", "metodo_id", "linha_origem",
                         name="resultado_unico"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    certificado_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("certificado.id", ondelete="RESTRICT"), nullable=False,
                                                      index=True)
    amostra_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("amostra.id", ondelete="RESTRICT"), index=True)
    codigo_laboratorio: Mapped[str] = mapped_column(String(60), nullable=False, index=True)  # como veio no laudo
    codigo_canonico: Mapped[str | None] = mapped_column(String(30), index=True)
    tipo_linha: Mapped[str] = mapped_column(String(3), nullable=False)
    analito_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("analito.id", ondelete="RESTRICT"), nullable=False, index=True)
    metodo_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("metodo_analitico.id", ondelete="RESTRICT"), nullable=False)
    unidade: Mapped[str] = mapped_column(String(10), nullable=False)
    valor_texto: Mapped[str] = mapped_column(String(40), nullable=False)
    valor_num: Mapped[float | None] = mapped_column(Float)
    qualificador: Mapped[str] = mapped_column(String(2), nullable=False)
    limite: Mapped[float | None] = mapped_column(Float)
    preferido: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linha_origem: Mapped[int] = mapped_column(Integer, nullable=False)
    observacao: Mapped[str | None] = mapped_column(Text)
