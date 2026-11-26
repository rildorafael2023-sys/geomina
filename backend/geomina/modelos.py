"""Importa todos os modelos para registrar as tabelas no metadata (usado pelo Alembic)."""

from geomina.core.auditoria import Auditoria  # noqa: F401
from geomina.modules.amostragem.models import Amostra, Campanha, Importacao, LoteEnvio, TipoAmostra  # noqa: F401
from geomina.modules.arquivos.models import Arquivo  # noqa: F401
from geomina.modules.auth.models import Papel, Permissao, Sessao, Usuario  # noqa: F401
from geomina.modules.dicionarios.models import Dicionario, Termo, TermoSinonimo  # noqa: F401
from geomina.modules.documentos.models import Documento, DocumentoVersao, DocumentoVinculo  # noqa: F401
from geomina.modules.estrutura.models import (  # noqa: F401
    FrenteAvanco,
    Mina,
    RegraHierarquia,
    TipoUnidade,
    UnidadeNivel,
    UnidadeOperacional,
)
from geomina.modules.geoop.models import LayoutAnalise  # noqa: F401
from geomina.modules.geoquimica.models import Analito, Certificado, Laboratorio, MetodoAnalitico, Resultado  # noqa: F401
from geomina.modules.mapeamento.models import (  # noqa: F401
    AmostraCitada,
    Intervalo,
    Mapeamento,
    MapeamentoRevisao,
    MedidaEstrutural,
)
from geomina.modules.sistema.models import ParametroSistema  # noqa: F401
from geomina.modules.sondagem.models import Furo, IntervaloFuro, SurveyFuro  # noqa: F401
from geomina.modules.topografia.models import (  # noqa: F401
    EixoVersao,
    FeicaoTopografica,
    Levantamento,
    PosicaoEixo,
    TransformacaoCoordenadas,
)
