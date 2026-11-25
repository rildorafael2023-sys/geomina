"""Importa todos os modelos para registrar as tabelas no metadata (usado pelo Alembic)."""

from geomina.core.auditoria import Auditoria  # noqa: F401
from geomina.modules.arquivos.models import Arquivo  # noqa: F401
from geomina.modules.auth.models import Papel, Permissao, Sessao, Usuario  # noqa: F401
from geomina.modules.sistema.models import ParametroSistema  # noqa: F401
