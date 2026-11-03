import { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, db } from './firebase';
import logo from './assets/logo.png';
import './App.css';

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const diasVencimento = [1, 5, 10, 15, 20, 25, 30];

const formatarMoeda = (valor) => moeda.format(valor || 0);
const obterProximoVencimento = (dia, referencia = new Date()) => {
  const diaNumerico = Number(dia);
  if (!Number.isInteger(diaNumerico) || diaNumerico < 1 || diaNumerico > 31) return Infinity;

  const hoje = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  let ano = hoje.getFullYear();
  let mes = hoje.getMonth();
  let ultimoDiaDoMes = new Date(ano, mes + 1, 0).getDate();
  let vencimento = new Date(ano, mes, Math.min(diaNumerico, ultimoDiaDoMes));

  if (vencimento < hoje) {
    mes += 1;
    ultimoDiaDoMes = new Date(ano, mes + 1, 0).getDate();
    vencimento = new Date(ano, mes, Math.min(diaNumerico, ultimoDiaDoMes));
  }

  return vencimento.getTime();
};
const dataHoje = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
}).format(new Date()).toLocaleUpperCase('pt-BR');

export default function App() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [celular, setCelular] = useState('');
  const [ministerios, setMinisterios] = useState([]);
  const [carregandoMinisterios, setCarregandoMinisterios] = useState(true);
  const [nomeNovoMinisterio, setNomeNovoMinisterio] = useState('');
  const [ministerioEmEdicao, setMinisterioEmEdicao] = useState(null);
  const [ministerioSelecionado, setMinisterioSelecionado] = useState('');
  const [filtroMinisterio, setFiltroMinisterio] = useState('');
  const [filtroStatusIngresso, setFiltroStatusIngresso] = useState('');
  const [filtroDiaVencimento, setFiltroDiaVencimento] = useState('');
  const [ordenacaoParticipantes, setOrdenacaoParticipantes] = useState('vencimento-asc');
  const [lotes, setLotes] = useState([]);
  const [loteSelecionado, setLoteSelecionado] = useState('');
  const [carregandoLotes, setCarregandoLotes] = useState(true);
  const [modalLotesAberto, setModalLotesAberto] = useState(false);
  const [nomeNovoLote, setNomeNovoLote] = useState('');
  const [valorNovoLote, setValorNovoLote] = useState('');
  const [loteEmEdicao, setLoteEmEdicao] = useState(null);
  const [parcelas, setParcelas] = useState(1);
  const [diaVencimento, setDiaVencimento] = useState('');
  const [participantes, setParticipantes] = useState([]);
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [usuario, setUsuario] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [carregandoLogin, setCarregandoLogin] = useState(false);
  const [carregandoRecuperacaoSenha, setCarregandoRecuperacaoSenha] = useState(false);
  const [erroLogin, setErroLogin] = useState('');
  const [mensagemRecuperacaoSenha, setMensagemRecuperacaoSenha] = useState('');
  const [notificacao, setNotificacao] = useState(null);
  const [relatorioImpressao, setRelatorioImpressao] = useState(null);
  const proximoIdNotificacao = useRef(0);
  const [modalPagamento, setModalPagamento] = useState({
    aberto: false,
    participante: null,
    tipo: 'fixo',
    valorPersonalizado: '',
  });
  const [modalExclusaoTodas, setModalExclusaoTodas] = useState({
    aberto: false,
    ids: [],
    carregando: false,
    excluindo: false,
  });

  const mostrarNotificacao = (mensagem, tipo = 'sucesso') => {
    proximoIdNotificacao.current += 1;
    setNotificacao({ id: proximoIdNotificacao.current, mensagem, tipo });
  };

  useEffect(() => {
    if (!notificacao) return undefined;
    const timeout = window.setTimeout(() => {
      setNotificacao((atual) => (atual?.id === notificacao.id ? null : atual));
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [notificacao]);

  useEffect(() => {
    if (!relatorioImpressao) return undefined;

    const encerrarImpressao = () => setRelatorioImpressao(null);
    const timeout = window.setTimeout(() => window.print(), 150);
    window.addEventListener('afterprint', encerrarImpressao);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('afterprint', encerrarImpressao);
    };
  }, [relatorioImpressao]);

  const lotesAtivos = lotes.filter((lote) => lote.ativo);
  const ministeriosAtivos = ministerios.filter((ministerio) => ministerio.ativo);
  const loteAtual = lotesAtivos.find((lote) => lote.id === loteSelecionado);
  const ministerioAtual = ministeriosAtivos.find((ministerio) => ministerio.id === ministerioSelecionado);
  const valorParcela = loteAtual && parcelas > 0 ? (loteAtual.valor / parcelas).toFixed(2) : '0.00';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (usuarioAutenticado) => {
        setUsuario(usuarioAutenticado);
        setCarregandoAuth(false);
      },
      (error) => {
        console.error('Erro ao verificar autenticação: ', error);
        setErroLogin('Não foi possível verificar sua autenticação. Atualize a página e tente novamente.');
        setCarregandoAuth(false);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!usuario) {
      setParticipantes([]);
      return undefined;
    }

    const q = query(collection(db, 'Participantes'), orderBy('numero_id', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map((participante) => ({
        id: participante.id,
        ...participante.data(),
      }));
      setParticipantes(lista);
    }, (error) => {
      console.error('Erro ao carregar participantes: ', error);
      mostrarNotificacao('Não foi possível carregar os participantes. Verifique as regras de acesso do Firestore.', 'erro');
    });
    return () => unsubscribe();
  }, [usuario]);

  useEffect(() => {
    if (!usuario) {
      setMinisterios([]);
      setMinisterioSelecionado('');
      setCarregandoMinisterios(false);
      return undefined;
    }

    setCarregandoMinisterios(true);
    const unsubscribe = onSnapshot(collection(db, 'Ministerios'), (snapshot) => {
      const lista = snapshot.docs.map((ministerio) => ({
        id: ministerio.id,
        ...ministerio.data(),
      })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setMinisterios(lista);
      setCarregandoMinisterios(false);
    }, (error) => {
      console.error('Erro ao carregar ministérios: ', error);
      mostrarNotificacao('Não foi possível carregar os ministérios cadastrados.', 'erro');
      setCarregandoMinisterios(false);
    });
    return () => unsubscribe();
  }, [usuario]);

  useEffect(() => {
    if (!usuario) {
      setLotes([]);
      setLoteSelecionado('');
      setCarregandoLotes(false);
      return undefined;
    }

    setCarregandoLotes(true);
    const unsubscribe = onSnapshot(collection(db, 'Lotes'), (snapshot) => {
      const lista = snapshot.docs.map((lote) => ({
        id: lote.id,
        ...lote.data(),
      })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      setLotes(lista);
      setCarregandoLotes(false);
    }, (error) => {
      console.error('Erro ao carregar lotes: ', error);
      mostrarNotificacao('Não foi possível carregar os lotes cadastrados.', 'erro');
      setCarregandoLotes(false);
    });
    return () => unsubscribe();
  }, [usuario]);

  useEffect(() => {
    if (!lotes.some((lote) => lote.ativo && lote.id === loteSelecionado)) {
      setLoteSelecionado(lotes.find((lote) => lote.ativo)?.id || '');
    }
  }, [lotes, loteSelecionado]);

  useEffect(() => {
    if (!ministerios.some((ministerio) => ministerio.ativo && ministerio.id === ministerioSelecionado)) {
      setMinisterioSelecionado(ministerios.find((ministerio) => ministerio.ativo)?.id || '');
    }
  }, [ministerios, ministerioSelecionado]);

  const handleEntrar = async (event) => {
    event.preventDefault();
    setErroLogin('');
    setMensagemRecuperacaoSenha('');
    setCarregandoLogin(true);

    try {
      await signInWithEmailAndPassword(auth, emailLogin.trim(), senhaLogin);
    } catch (error) {
      console.error('Erro ao entrar: ', error);
      const mensagens = {
        'auth/invalid-credential': 'E-mail ou senha incorretos.',
        'auth/user-disabled': 'Esta conta foi desativada.',
        'auth/too-many-requests': 'Muitas tentativas. Aguarde um momento e tente novamente.',
        'auth/network-request-failed': 'Não foi possível conectar. Verifique sua internet e tente novamente.',
        'auth/operation-not-allowed': 'O login por e-mail e senha não está ativado no Firebase.',
      };
      setErroLogin(mensagens[error.code] || 'Não foi possível entrar. Verifique suas credenciais e tente novamente.');
    } finally {
      setCarregandoLogin(false);
    }
  };

  const handleRecuperarSenha = async () => {
    const emailRecuperacao = emailLogin.trim();
    setErroLogin('');
    setMensagemRecuperacaoSenha('');

    if (!emailRecuperacao) {
      setErroLogin('Informe seu e-mail para receber o link de recuperação.');
      return;
    }

    setCarregandoRecuperacaoSenha(true);
    try {
      await sendPasswordResetEmail(auth, emailRecuperacao);
      setMensagemRecuperacaoSenha('Se este e-mail estiver associado a uma conta, você receberá um link para redefinir sua senha.');
    } catch (error) {
      console.error('Erro ao solicitar recuperação de senha: ', error);
      const mensagens = {
        'auth/invalid-email': 'O e-mail informado não é válido.',
        'auth/too-many-requests': 'Muitas solicitações. Aguarde um momento antes de tentar novamente.',
        'auth/network-request-failed': 'Não foi possível conectar. Verifique sua internet e tente novamente.',
        'auth/operation-not-allowed': 'A recuperação de senha por e-mail não está habilitada no Firebase.',
      };
      setErroLogin(mensagens[error.code] || 'Não foi possível solicitar a recuperação. Tente novamente.');
    } finally {
      setCarregandoRecuperacaoSenha(false);
    }
  };

  const handleSair = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Erro ao sair: ', error);
      mostrarNotificacao('Não foi possível encerrar a sessão. Tente novamente.', 'erro');
    }
  };

  const participantesConfirmados = participantes.filter((participante) => participante.status_ingresso !== 'anulada');
  const inscricoesPorEmail = participantes.reduce((contagem, participante) => {
    const emailNormalizado = participante.email?.trim().toLocaleLowerCase('pt-BR');
    if (emailNormalizado) {
      contagem.set(emailNormalizado, (contagem.get(emailNormalizado) || 0) + 1);
    }
    return contagem;
  }, new Map());
  const totalInscricoesCompartilhadas = participantes.filter((participante) => {
    const emailNormalizado = participante.email?.trim().toLocaleLowerCase('pt-BR');
    return emailNormalizado && inscricoesPorEmail.get(emailNormalizado) > 1;
  }).length;
  const totalEsperado = participantesConfirmados.reduce((acc, participante) => acc + (participante.valor_total || 0), 0);
  const totalPendente = participantesConfirmados.reduce((acc, participante) => acc + (participante.saldo_devedor || 0), 0);
  const totalRecebido = totalEsperado - totalPendente;
  const referenciaOrdenacao = new Date();
  const participantesFiltrados = participantes.filter((participante) => {
    const busca = termoPesquisa.toLowerCase();
    const correspondeBusca = [participante.nome, participante.email, participante.ministerio_nome]
      .some((valor) => (valor || '').toLowerCase().includes(busca));
    const correspondeMinisterio = !filtroMinisterio
      || (filtroMinisterio === 'sem-ministerio' && !participante.ministerio_id)
      || participante.ministerio_id === filtroMinisterio;
    const statusIngresso = participante.status_ingresso === 'anulada' ? 'anulada' : 'confirmada';
    const correspondeStatus = !filtroStatusIngresso || statusIngresso === filtroStatusIngresso;
    const correspondeVencimento = !filtroDiaVencimento
      || Number(participante.dia_vencimento) === Number(filtroDiaVencimento);
    return correspondeBusca && correspondeMinisterio && correspondeStatus && correspondeVencimento;
  }).sort((a, b) => {
    const direcoes = {
      'vencimento-asc': obterProximoVencimento(a.dia_vencimento, referenciaOrdenacao)
        - obterProximoVencimento(b.dia_vencimento, referenciaOrdenacao),
      'vencimento-desc': obterProximoVencimento(b.dia_vencimento, referenciaOrdenacao)
        - obterProximoVencimento(a.dia_vencimento, referenciaOrdenacao),
      'nome-asc': (a.nome || '').localeCompare(b.nome || '', 'pt-BR'),
      'nome-desc': (b.nome || '').localeCompare(a.nome || '', 'pt-BR'),
      'saldo-desc': (b.saldo_devedor || 0) - (a.saldo_devedor || 0),
      'saldo-asc': (a.saldo_devedor || 0) - (b.saldo_devedor || 0),
    };
    return direcoes[ordenacaoParticipantes] || 0;
  });
  const percentualRecebido = totalEsperado > 0 ? (totalRecebido / totalEsperado) * 100 : 0;

  const formatarCelular = (valor) => {
    let v = valor.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length <= 2) return v;
    if (v.length <= 6) return `(${v.slice(0, 2)}) ${v.slice(2)}`;
    if (v.length <= 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
    return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  };

  const handleSalvarLote = async (event) => {
    event.preventDefault();
    const nomeLimpo = nomeNovoLote.trim();
    const valor = Number(valorNovoLote);
    if (!nomeLimpo || !Number.isFinite(valor) || valor <= 0) {
      mostrarNotificacao('Informe o nome do lote e um valor maior que zero.', 'erro');
      return;
    }

    try {
      await addDoc(collection(db, 'Lotes'), {
        nome: nomeLimpo,
        valor,
        ativo: true,
      });
      setNomeNovoLote('');
      setValorNovoLote('');
      mostrarNotificacao('Lote cadastrado e habilitado com sucesso.');
    } catch (error) {
      console.error('Erro ao cadastrar lote: ', error);
      mostrarNotificacao('Não foi possível cadastrar o lote.', 'erro');
    }
  };

  const alternarLote = async (lote) => {
    try {
      await updateDoc(doc(db, 'Lotes', lote.id), { ativo: !lote.ativo });
      mostrarNotificacao(lote.ativo ? 'Lote desabilitado.' : 'Lote habilitado.');
    } catch (error) {
      console.error('Erro ao atualizar lote: ', error);
      mostrarNotificacao('Não foi possível atualizar o lote.', 'erro');
    }
  };

  const iniciarEdicaoLote = (lote) => {
    setLoteEmEdicao({ id: lote.id, nome: lote.nome, valor: String(lote.valor) });
  };

  const cancelarEdicaoLote = () => setLoteEmEdicao(null);

  const salvarEdicaoLote = async (event) => {
    event.preventDefault();
    if (!loteEmEdicao) return;

    const nomeLimpo = loteEmEdicao.nome.trim();
    const valor = Number(loteEmEdicao.valor);
    if (!nomeLimpo || !Number.isFinite(valor) || valor <= 0) {
      mostrarNotificacao('Informe o nome do lote e um valor maior que zero.', 'erro');
      return;
    }

    try {
      await updateDoc(doc(db, 'Lotes', loteEmEdicao.id), { nome: nomeLimpo, valor });
      setLoteEmEdicao(null);
      mostrarNotificacao('Lote atualizado com sucesso. Inscrições existentes mantêm os valores registrados.');
    } catch (error) {
      console.error('Erro ao editar lote: ', error);
      mostrarNotificacao('Não foi possível editar o lote.', 'erro');
    }
  };

  const excluirLote = async (lote) => {
    const confirmar = window.confirm(`Excluir o lote "${lote.nome}"? As inscrições já cadastradas manterão seus valores.`);
    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, 'Lotes', lote.id));
      if (loteEmEdicao?.id === lote.id) setLoteEmEdicao(null);
      mostrarNotificacao('Lote excluído com sucesso.');
    } catch (error) {
      console.error('Erro ao excluir lote: ', error);
      mostrarNotificacao('Não foi possível excluir o lote.', 'erro');
    }
  };

  const handleSalvarMinisterio = async (event) => {
    event.preventDefault();
    const nomeLimpo = nomeNovoMinisterio.trim();
    if (!nomeLimpo) {
      mostrarNotificacao('Informe o nome do ministério.', 'erro');
      return;
    }
    if (ministerios.some((ministerio) => ministerio.nome.toLocaleLowerCase('pt-BR') === nomeLimpo.toLocaleLowerCase('pt-BR'))) {
      mostrarNotificacao('Este ministério já está cadastrado.', 'erro');
      return;
    }

    try {
      await addDoc(collection(db, 'Ministerios'), { nome: nomeLimpo, ativo: true });
      setNomeNovoMinisterio('');
      mostrarNotificacao('Ministério cadastrado e habilitado com sucesso.');
    } catch (error) {
      console.error('Erro ao cadastrar ministério: ', error);
      mostrarNotificacao('Não foi possível cadastrar o ministério.', 'erro');
    }
  };

  const alternarMinisterio = async (ministerio) => {
    try {
      await updateDoc(doc(db, 'Ministerios', ministerio.id), { ativo: !ministerio.ativo });
      mostrarNotificacao(ministerio.ativo ? 'Ministério desabilitado.' : 'Ministério habilitado.');
    } catch (error) {
      console.error('Erro ao atualizar ministério: ', error);
      mostrarNotificacao('Não foi possível atualizar o ministério.', 'erro');
    }
  };

  const iniciarEdicaoMinisterio = (ministerio) => {
    setMinisterioEmEdicao({ id: ministerio.id, nome: ministerio.nome });
  };

  const cancelarEdicaoMinisterio = () => setMinisterioEmEdicao(null);

  const salvarEdicaoMinisterio = async (event) => {
    event.preventDefault();
    if (!ministerioEmEdicao) return;

    const nomeLimpo = ministerioEmEdicao.nome.trim();
    if (!nomeLimpo) {
      mostrarNotificacao('Informe o nome do ministério.', 'erro');
      return;
    }
    if (ministerios.some((ministerio) => (
      ministerio.id !== ministerioEmEdicao.id
      && ministerio.nome.toLocaleLowerCase('pt-BR') === nomeLimpo.toLocaleLowerCase('pt-BR')
    ))) {
      mostrarNotificacao('Este ministério já está cadastrado.', 'erro');
      return;
    }

    const participantesVinculados = participantes.filter(
      (participante) => participante.ministerio_id === ministerioEmEdicao.id,
    );
    if (participantesVinculados.length > 499) {
      mostrarNotificacao('Este ministério tem muitas inscrições vinculadas para atualizar de uma só vez.', 'erro');
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'Ministerios', ministerioEmEdicao.id), { nome: nomeLimpo });
      participantesVinculados.forEach((participante) => {
        batch.update(doc(db, 'Participantes', participante.id), { ministerio_nome: nomeLimpo });
      });
      await batch.commit();
      setMinisterioEmEdicao(null);
      mostrarNotificacao('Ministério atualizado nas inscrições vinculadas.');
    } catch (error) {
      console.error('Erro ao editar ministério: ', error);
      mostrarNotificacao('Não foi possível editar o ministério.', 'erro');
    }
  };

  const excluirMinisterio = async (ministerio) => {
    const participantesVinculados = participantes.filter(
      (participante) => participante.ministerio_id === ministerio.id,
    );
    if (participantesVinculados.length > 499) {
      mostrarNotificacao('Este ministério tem muitas inscrições vinculadas para excluir de uma só vez.', 'erro');
      return;
    }

    const confirmar = window.confirm(
      `Excluir o ministério "${ministerio.nome}"? ${participantesVinculados.length} inscrições vinculadas manterão o nome histórico, mas ficarão sem ministério associado.`,
    );
    if (!confirmar) return;

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'Ministerios', ministerio.id));
      participantesVinculados.forEach((participante) => {
        batch.update(doc(db, 'Participantes', participante.id), { ministerio_id: null });
      });
      await batch.commit();
      if (ministerioEmEdicao?.id === ministerio.id) setMinisterioEmEdicao(null);
      if (filtroMinisterio === ministerio.id) setFiltroMinisterio('sem-ministerio');
      mostrarNotificacao('Ministério excluído. As inscrições mantiveram o nome histórico.');
    } catch (error) {
      console.error('Erro ao excluir ministério: ', error);
      mostrarNotificacao('Não foi possível excluir o ministério.', 'erro');
    }
  };

  const handleSalvar = async () => {
    if (!nome || !diaVencimento || !parcelas || !loteAtual || !ministerioAtual) {
      if (!loteAtual) {
        mostrarNotificacao('Cadastre e habilite um lote antes de adicionar participantes.', 'erro');
        return;
      }
      if (!ministerioAtual) {
        mostrarNotificacao('Cadastre e habilite um ministério antes de adicionar participantes.', 'erro');
        return;
      }
      mostrarNotificacao('Por favor, preencha os campos obrigatórios (nome, ministério, parcelas e dia de vencimento).', 'erro');
      return;
    }

    try {
      const q = query(collection(db, 'Participantes'), orderBy('numero_id', 'desc'), limit(1));
      const querySnapshot = await getDocs(q);
      let proximoNumero = 1;
      if (!querySnapshot.empty) {
        proximoNumero = querySnapshot.docs[0].data().numero_id + 1;
      }

      const stringId = `ID${proximoNumero.toString().padStart(2, '0')}`;
      await setDoc(doc(db, 'Participantes', stringId), {
        numero_id: proximoNumero,
        nome,
        email: email.trim(),
        celular,
        status_ingresso: 'confirmada',
        ministerio_id: ministerioAtual.id,
        ministerio_nome: ministerioAtual.nome,
        valor_total: loteAtual.valor,
        quantidade_parcelas: parcelas,
        valor_parcela: Number(valorParcela),
        dia_vencimento: diaVencimento,
        saldo_devedor: loteAtual.valor,
        historico_pagamentos: [],
      });

      setNome('');
      setEmail('');
      setCelular('');
      setMinisterioSelecionado('');
      setDiaVencimento('');
      setParcelas(1);
      mostrarNotificacao('Participante cadastrado com sucesso.');
    } catch (error) {
      console.error('Erro ao guardar documento: ', error);
      mostrarNotificacao('Erro ao guardar os dados.', 'erro');
    }
  };

  const atualizarStatusIngresso = async (participante, status) => {
    if (status === 'anulada') {
      const confirmar = window.confirm(`Anular o ingresso de ${participante.nome}? Esta inscrição deixará de contar nos totais financeiros e de participantes confirmados.`);
      if (!confirmar) return;
    }

    try {
      await updateDoc(doc(db, 'Participantes', participante.id), { status_ingresso: status });
      mostrarNotificacao(status === 'anulada' ? 'Ingresso anulado.' : 'Ingresso confirmado.');
    } catch (error) {
      console.error('Erro ao atualizar o status do ingresso: ', error);
      mostrarNotificacao('Não foi possível atualizar o status do ingresso.', 'erro');
    }
  };

  const abrirModal = (participante) => {
    if (participante.saldo_devedor <= 0) {
      mostrarNotificacao('Este participante já tem o saldo totalmente pago.', 'erro');
      return;
    }
    setModalPagamento({
      aberto: true,
      participante,
      tipo: 'fixo',
      valorPersonalizado: '',
    });
  };

  const confirmarPagamento = async () => {
    const participante = modalPagamento.participante;
    const valorAAbater = modalPagamento.tipo === 'fixo'
      ? participante.valor_parcela
      : modalPagamento.tipo === 'avista'
        ? participante.saldo_devedor
        : Number(modalPagamento.valorPersonalizado);

    if (!valorAAbater || valorAAbater <= 0) {
      mostrarNotificacao('Por favor, insira um valor válido maior que zero.', 'erro');
      return;
    }

    if (valorAAbater > participante.saldo_devedor) {
      mostrarNotificacao(`O valor digitado (${formatarMoeda(valorAAbater)}) não pode ser maior que o saldo devedor atual (${formatarMoeda(participante.saldo_devedor)}).`, 'erro');
      return;
    }

    const confirmar = window.confirm(`Confirmar o abatimento de ${formatarMoeda(valorAAbater)} no saldo de ${participante.nome}?`);
    if (!confirmar) return;

    let novoSaldo = participante.saldo_devedor - valorAAbater;
    if (novoSaldo < 0.05) novoSaldo = 0;

    const novoPagamento = {
      data: new Date().toLocaleString('pt-BR'),
      valor: valorAAbater,
    };

    try {
      const participanteRef = doc(db, 'Participantes', participante.id);
      await updateDoc(participanteRef, {
        saldo_devedor: Number(novoSaldo.toFixed(2)),
        historico_pagamentos: arrayUnion(novoPagamento),
      });
      setModalPagamento({
        aberto: false,
        participante: null,
        tipo: 'fixo',
        valorPersonalizado: '',
      });
      mostrarNotificacao('Pagamento registrado com sucesso.');
    } catch (error) {
      console.error('Erro ao atualizar o saldo: ', error);
      mostrarNotificacao('Erro ao registar o pagamento.', 'erro');
    }
  };

  const handleExcluir = async (id, nomeParticipante) => {
    const confirmar = window.confirm(`ATENÇÃO: Tem a certeza de que deseja excluir permanentemente o registo de ${nomeParticipante}?`);
    if (!confirmar) return;

    try {
      await deleteDoc(doc(db, 'Participantes', id));
      mostrarNotificacao('Participante excluído com sucesso.');
    } catch (error) {
      console.error('Erro ao excluir documento: ', error);
      mostrarNotificacao('Erro ao excluir o participante.', 'erro');
    }
  };

  const abrirModalExclusaoTodas = async () => {
    setModalExclusaoTodas({
      aberto: true,
      ids: [],
      carregando: true,
      excluindo: false,
    });

    try {
      const snapshot = await getDocs(collection(db, 'Participantes'));
      setModalExclusaoTodas({
        aberto: true,
        ids: snapshot.docs.map((participante) => participante.id),
        carregando: false,
        excluindo: false,
      });
    } catch (error) {
      console.error('Erro ao selecionar participantes para exclusão: ', error);
      setModalExclusaoTodas({
        aberto: false,
        ids: [],
        carregando: false,
        excluindo: false,
      });
      mostrarNotificacao('Não foi possível carregar as inscrições para exclusão.', 'erro');
    }
  };

  const excluirTodasInscricoes = async () => {
    const ids = modalExclusaoTodas.ids;
    if (ids.length === 0 || modalExclusaoTodas.carregando || modalExclusaoTodas.excluindo) return;

    setModalExclusaoTodas((atual) => ({ ...atual, excluindo: true }));
    let quantidadeExcluida = 0;

    try {
      for (let inicio = 0; inicio < ids.length; inicio += 500) {
        const lote = ids.slice(inicio, inicio + 500);
        const batch = writeBatch(db);
        lote.forEach((id) => batch.delete(doc(db, 'Participantes', id)));
        await batch.commit();
        quantidadeExcluida += lote.length;
      }

      setModalExclusaoTodas({
        aberto: false,
        ids: [],
        carregando: false,
        excluindo: false,
      });
      mostrarNotificacao(`${quantidadeExcluida} ${quantidadeExcluida === 1 ? 'inscrição excluída' : 'inscrições excluídas'} com sucesso.`);
    } catch (error) {
      console.error('Erro ao excluir todas as inscrições: ', error);
      const idsRestantes = ids.slice(quantidadeExcluida);
      setModalExclusaoTodas((atual) => ({ ...atual, ids: idsRestantes, excluindo: false }));
      const detalhe = quantidadeExcluida > 0
        ? `${quantidadeExcluida} ${quantidadeExcluida === 1 ? 'inscrição já foi excluída' : 'inscrições já foram excluídas'}.`
        : 'Nenhuma inscrição foi excluída.';
      mostrarNotificacao(
        `Não foi possível concluir a exclusão. ${detalhe} Restam ${idsRestantes.length} ${idsRestantes.length === 1 ? 'inscrição selecionada' : 'inscrições selecionadas'}.`,
        'erro',
      );
    }
  };

  const fecharModalExclusaoTodas = () => {
    if (modalExclusaoTodas.carregando || modalExclusaoTodas.excluindo) return;
    setModalExclusaoTodas({
      aberto: false,
      ids: [],
      carregando: false,
      excluindo: false,
    });
  };

  const handleLembreteWhatsApp = (participante) => {
    const numeroLimpo = participante.celular.replace(/\D/g, '');
    if (numeroLimpo.length < 10) {
      mostrarNotificacao('O número de telemóvel registado parece estar inválido ou em falta.', 'erro');
      return;
    }
    const mensagem = `Olá ${participante.nome}! Tudo bem? Passando para relembrar do vencimento da sua parcela do acampamento no valor de ${formatarMoeda(participante.valor_parcela)}, programada para o dia ${participante.dia_vencimento}. Qualquer dúvida, estou à disposição!`;
    const url = `https://wa.me/55${numeroLimpo}?text=${encodeURIComponent(mensagem)}`;
    window.open(url, '_blank');
  };

  const exportarRelatorioParticipantes = () => {
    if (participantesFiltrados.length === 0) {
      mostrarNotificacao('Não há participantes na visualização atual para exportar.', 'erro');
      return;
    }

    const filtrosAtivos = [
      filtroMinisterio
        ? ministerios.find((ministerio) => ministerio.id === filtroMinisterio)?.nome
          || (filtroMinisterio === 'sem-ministerio' ? 'Sem ministério' : null)
        : null,
      filtroStatusIngresso ? `Ingressos ${filtroStatusIngresso}` : null,
      filtroDiaVencimento ? `Vencimento dia ${filtroDiaVencimento}` : null,
      termoPesquisa.trim() ? `Busca: "${termoPesquisa.trim()}"` : null,
    ].filter(Boolean);

    setRelatorioImpressao({
      participantes: [...participantesFiltrados],
      geradoEm: new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(new Date()),
      filtros: filtrosAtivos,
    });
  };

  const exportarParticipantesCSV = () => {
    if (participantes.length === 0) {
      mostrarNotificacao('Não há participantes cadastrados para exportar.', 'erro');
      return;
    }

    const colunas = [
      ['ID', (participante) => participante.id],
      ['Número da inscrição', (participante) => participante.numero_id],
      ['Nome', (participante) => participante.nome],
      ['E-mail', (participante) => participante.email],
      ['Celular', (participante) => participante.celular],
      ['Ministério', (participante) => participante.ministerio_nome || 'Não informado'],
      ['Status do ingresso', (participante) => participante.status_ingresso === 'anulada' ? 'Anulado' : 'Confirmado'],
      ['Dia de vencimento', (participante) => participante.dia_vencimento],
      ['Valor total', (participante) => participante.valor_total],
      ['Quantidade de parcelas', (participante) => participante.quantidade_parcelas],
      ['Valor da parcela', (participante) => participante.valor_parcela],
      ['Saldo devedor', (participante) => participante.saldo_devedor],
      ['Histórico de pagamentos', (participante) => (participante.historico_pagamentos || [])
        .map((pagamento) => `${pagamento.data}: ${formatarMoeda(pagamento.valor)}`)
        .join(' | ')],
    ];
    const escaparCampo = (valor) => {
      const texto = String(valor ?? '').replace(/^[\t\r\n ]*[=+\-@]/, (inicio) => `'${inicio}`);
      return `"${texto.replaceAll('"', '""')}"`;
    };
    const formatarValorCSV = (valor) => (
      typeof valor === 'number'
        ? valor.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 2 })
        : valor
    );
    const linhas = [
      colunas.map(([titulo]) => escaparCampo(titulo)).join(';'),
      ...participantes.map((participante) => colunas
        .map(([, obterValor]) => escaparCampo(formatarValorCSV(obterValor(participante))))
        .join(';')),
    ];
    const conteudo = `\uFEFF${linhas.join('\r\n')}`;
    const dataAtual = new Date();
    const dataArquivo = [
      dataAtual.getFullYear(),
      String(dataAtual.getMonth() + 1).padStart(2, '0'),
      String(dataAtual.getDate()).padStart(2, '0'),
    ].join('-');

    try {
      const arquivo = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inscricoes-acampa-${dataArquivo}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      mostrarNotificacao(`${participantes.length} ${participantes.length === 1 ? 'participante exportado' : 'participantes exportados'} em CSV.`);
    } catch (error) {
      console.error('Erro ao exportar participantes em CSV: ', error);
      mostrarNotificacao('Não foi possível gerar o arquivo CSV.', 'erro');
    }
  };

  const fecharModal = () => setModalPagamento({
    aberto: false,
    participante: null,
    tipo: 'fixo',
    valorPersonalizado: '',
  });

  if (carregandoAuth) {
    return (
      <main className="auth-screen">
        <section className="auth-card" aria-live="polite">
          <img className="brand-logo auth-brand-logo" src={logo} alt="" />
          <p>Verificando sua sessão...</p>
        </section>
      </main>
    );
  }

  if (!usuario) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <a className="brand auth-brand" href="#inicio" aria-label="Acampa">
            <img className="brand-logo auth-brand-logo" src={logo} alt="" />
            <span className="brand-copy"><strong>acampa</strong><small>gestão do acampamento</small></span>
          </a>
          <div className="auth-heading">
            <span className="section-kicker">ÁREA RESTRITA</span>
            <h1>Acesse sua conta</h1>
            <p>Entre com seu e-mail e senha para continuar.</p>
          </div>
          <form className="auth-form" onSubmit={handleEntrar}>
            <label className="field">
              <span>E-mail</span>
              <input
                type="email"
                value={emailLogin}
                onChange={(event) => {
                  setEmailLogin(event.target.value);
                  setMensagemRecuperacaoSenha('');
                  setErroLogin('');
                }}
                placeholder="seu@email.com"
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              <span>Senha</span>
              <input
                type="password"
                value={senhaLogin}
                onChange={(event) => setSenhaLogin(event.target.value)}
                placeholder="Sua senha"
                autoComplete="current-password"
                required
              />
            </label>
            {erroLogin && <p className="auth-error" role="alert">{erroLogin}</p>}
            {mensagemRecuperacaoSenha && <p className="auth-success" role="status">{mensagemRecuperacaoSenha}</p>}
            <button className="button button-primary auth-submit" type="submit" disabled={carregandoLogin || carregandoRecuperacaoSenha}>
              {carregandoLogin ? 'Entrando...' : 'Entrar'}
              {!carregandoLogin && <span aria-hidden="true">→</span>}
            </button>
            <button
              className="text-button auth-recovery-button"
              type="button"
              onClick={handleRecuperarSenha}
              disabled={carregandoLogin || carregandoRecuperacaoSenha}
            >
              {carregandoRecuperacaoSenha ? 'Enviando link...' : 'Esqueceu sua senha?'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {notificacao && (
        <div className={`toast toast-${notificacao.tipo}`} role={notificacao.tipo === 'erro' ? 'alert' : 'status'}>
          <span className="toast-icon" aria-hidden="true">{notificacao.tipo === 'erro' ? '!' : '✓'}</span>
          <p>{notificacao.mensagem}</p>
          <button className="toast-close" type="button" onClick={() => setNotificacao(null)} aria-label="Fechar notificação">×</button>
        </div>
      )}
      <aside className="sidebar">
        <a className="brand" href="#inicio" aria-label="Acampa, início">
          <img className="brand-logo" src={logo} alt="" />
          <span className="brand-copy"><strong>acampa</strong><small>gestão de acampamentos</small></span>
        </a>

        <div className="sidebar-label">MENU PRINCIPAL</div>
        <nav className="side-nav" aria-label="Navegação principal">
          <a className="nav-link active" href="#inicio"><span aria-hidden="true">▦</span> Visão geral</a>
          <a className="nav-link" href="#participantes"><span aria-hidden="true">♧</span> Participantes</a>
          <a className="nav-link" href="#novo-participante"><span aria-hidden="true">＋</span> Novo cadastro</a>
          <a className="nav-link" href="#ministerios"><span aria-hidden="true">◇</span> Ministérios</a>
        </nav>

        <div className="sidebar-bottom">
          <div className="camp-card">
            <div className="camp-icon" aria-hidden="true">🏕️</div>
            <strong>Camp</strong>
            <span>Um Lugar de Encontro.</span>
          </div>
          <div className="profile">
            <span className="avatar">{usuario.email?.charAt(0).toUpperCase() || 'U'}</span>
            <span className="profile-info"><strong>{usuario.email}</strong><small>Sessão autenticada</small></span>
            <button className="logout-button" onClick={handleSair}>Sair</button>
          </div>
        </div>
      </aside>

      <main className="main-content" id="inicio">
        <header className="topbar">
          <div className="breadcrumb"><span>Painel</span><span className="breadcrumb-separator">/</span><strong>Visão geral</strong></div>
          <div className="topbar-right">
            <span className="sync-status"><span className="status-dot" /> Dados sincronizados</span>
            <span className="topbar-avatar" aria-label={usuario.email || 'Usuário autenticado'}>
              {usuario.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <p className="eyebrow">{dataHoje}</p>
              <h1>Visão geral</h1>
              <p className="page-subtitle">Acompanhe as inscrições e a saúde financeira do seu acampamento.</p>
            </div>
            <a className="button button-primary welcome-action" href="#novo-participante"><span aria-hidden="true">👤</span> Novo participante</a>
          </section>

          <section className="metrics-grid" aria-label="Resumo de inscrições e financeiro">
            <article className="metric-card metric-participants">
              <div className="metric-top">
                <span className="metric-label">Participantes confirmados</span>
                <span className="metric-icon" aria-hidden="true">♧</span>
              </div>
              <strong className="metric-value">{participantesConfirmados.length}</strong>
              <span className="metric-caption">{participantes.length - participantesConfirmados.length} inscrições anuladas</span>
              <div className="metric-accent" />
            </article>
            <article className="metric-card metric-expected">
              <div className="metric-top">
                <span className="metric-label">Total esperado</span>
                <span className="metric-icon" aria-hidden="true">↗</span>
              </div>
              <strong className="metric-value">{formatarMoeda(totalEsperado)}</strong>
              <span className="metric-caption">Valor total das inscrições</span>
              <div className="metric-accent" />
            </article>
            <article className="metric-card metric-received">
              <div className="metric-top">
                <span className="metric-label">Total recebido</span>
                <span className="metric-icon" aria-hidden="true">✓</span>
              </div>
              <strong className="metric-value">{formatarMoeda(totalRecebido)}</strong>
              <span className="metric-caption">{percentualRecebido.toFixed(0)}% do total esperado</span>
              <div className="progress-track" role="progressbar" aria-label="Percentual recebido" aria-valuenow={percentualRecebido} aria-valuemin="0" aria-valuemax="100">
                <span style={{ width: `${Math.min(percentualRecebido, 100)}%` }} />
              </div>
            </article>
            <article className="metric-card metric-pending">
              <div className="metric-top">
                <span className="metric-label">Total pendente</span>
                <span className="metric-icon" aria-hidden="true">◷</span>
              </div>
              <strong className="metric-value">{formatarMoeda(totalPendente)}</strong>
              <span className="metric-caption">Aguardando pagamento</span>
              <div className="metric-accent" />
            </article>
          </section>

          <section className="workspace-grid">
            <section className="panel participants-panel" id="participantes">
              <div className="participants-heading">
                <div>
                  <span className="section-kicker">ACOMPANHAMENTO</span>
                  <h2>Participantes <span className="count-badge">{participantes.length}</span></h2>
                  <p>Gerencie inscrições e pagamentos.</p>
                </div>
                <div className="participant-tools">
                  <label className="ministry-filter">
                    <span className="sr-only">Filtrar por ministério</span>
                    <select value={filtroMinisterio} onChange={(event) => setFiltroMinisterio(event.target.value)} aria-label="Filtrar por ministério">
                      <option value="">Todos os ministérios</option>
                      {ministerios.map((ministerio) => (
                        <option key={ministerio.id} value={ministerio.id}>{ministerio.nome}</option>
                      ))}
                      {participantes.some((participante) => !participante.ministerio_id) && (
                        <option value="sem-ministerio">Sem ministério</option>
                      )}
                    </select>
                  </label>
                  <label className="status-filter">
                    <span className="sr-only">Filtrar por status do ingresso</span>
                    <select value={filtroStatusIngresso} onChange={(event) => setFiltroStatusIngresso(event.target.value)} aria-label="Filtrar por status do ingresso">
                      <option value="">Todos os status</option>
                      <option value="confirmada">Confirmadas</option>
                      <option value="anulada">Desistências</option>
                    </select>
                  </label>
                  <label className="due-day-filter">
                    <span className="sr-only">Filtrar por dia de vencimento</span>
                    <select value={filtroDiaVencimento} onChange={(event) => setFiltroDiaVencimento(event.target.value)} aria-label="Filtrar por dia de vencimento">
                      <option value="">Todos os vencimentos</option>
                      {diasVencimento.map((dia) => (
                        <option key={dia} value={dia}>Vencimento dia {dia}</option>
                      ))}
                    </select>
                  </label>
                  <label className="sort-filter">
                    <span className="sr-only">Ordenar participantes</span>
                    <select value={ordenacaoParticipantes} onChange={(event) => setOrdenacaoParticipantes(event.target.value)} aria-label="Ordenar participantes">
                      <option value="vencimento-asc">Vencimento: mais próximo</option>
                      <option value="vencimento-desc">Vencimento: mais distante</option>
                      <option value="nome-asc">Nome: A a Z</option>
                      <option value="nome-desc">Nome: Z a A</option>
                      <option value="saldo-desc">Maior saldo pendente</option>
                      <option value="saldo-asc">Menor saldo pendente</option>
                    </select>
                  </label>
                  <label className="search-field">
                    <span className="search-icon" aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      placeholder="Buscar participante..."
                      value={termoPesquisa}
                      onChange={(event) => setTermoPesquisa(event.target.value)}
                      aria-label="Buscar participante"
                    />
                    <kbd>⌘ K</kbd>
                  </label>
                  {(filtroMinisterio || filtroStatusIngresso || filtroDiaVencimento || termoPesquisa) && (
                    <button
                      className="clear-filters"
                      type="button"
                      onClick={() => {
                        setFiltroMinisterio('');
                        setFiltroStatusIngresso('');
                        setFiltroDiaVencimento('');
                        setTermoPesquisa('');
                      }}
                    >
                      Limpar filtros
                    </button>
                  )}
                  <button
                    className="button button-primary export-report-button"
                    type="button"
                    onClick={exportarRelatorioParticipantes}
                    disabled={participantesFiltrados.length === 0}
                    title="Abre a caixa de impressão do navegador para salvar a lista como PDF"
                  >
                    Exportar lista em PDF <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    className="button button-primary export-csv-button"
                    type="button"
                    onClick={exportarParticipantesCSV}
                    disabled={participantes.length === 0}
                    title="Exporta todos os participantes em CSV compatível com Excel"
                  >
                    Exportar todos em CSV <span aria-hidden="true">↓</span>
                  </button>
                  <button
                    className="button button-small button-cancel-registration bulk-delete-button"
                    type="button"
                    onClick={abrirModalExclusaoTodas}
                    disabled={modalExclusaoTodas.carregando || modalExclusaoTodas.aberto}
                  >
                    Excluir todas as inscrições
                  </button>
                  <span className="export-report-hint">Na impressão, escolha “Salvar como PDF”.</span>
                </div>
              </div>

              {totalInscricoesCompartilhadas > 0 && (
                <p className="duplicate-notice" role="status">
                  <strong>{totalInscricoesCompartilhadas} {totalInscricoesCompartilhadas === 1 ? 'inscrição compartilha' : 'inscrições compartilham'} e-mail com outra inscrição.</strong>
                  {' '}Revise cada ingresso individualmente; e-mails iguais não significam necessariamente duplicidade.
                </p>
              )}

              <div className="table-scroll">
                <table className="participants-table">
                  <thead>
                    <tr>
                      <th>PARTICIPANTE</th>
                      <th>MINISTÉRIO</th>
                      <th>VENCIMENTO</th>
                      <th>HISTÓRICO</th>
                      <th>SALDO PENDENTE</th>
                      <th><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participantesFiltrados.map((participante) => {
                      const pagamentos = participante.historico_pagamentos || [];
                      const statusIngresso = participante.status_ingresso === 'anulada' ? 'anulada' : 'confirmada';
                      const emailNormalizado = participante.email?.trim().toLocaleLowerCase('pt-BR');
                      const quantidadeMesmoEmail = emailNormalizado ? inscricoesPorEmail.get(emailNormalizado) || 0 : 0;
                      return (
                        <tr key={participante.id}>
                          <td>
                            <div className="participant-cell">
                              <span className="participant-avatar">{participante.nome?.trim().charAt(0).toUpperCase() || '?'}</span>
                              <span className="participant-info">
                                <strong>{participante.nome}</strong>
                                <small>{participante.email || participante.id}</small>
                                {quantidadeMesmoEmail > 1 && (
                                  <span className="duplicate-label">
                                    E-mail em {quantidadeMesmoEmail} inscrições · revise
                                  </span>
                                )}
                                <span className={`registration-status ${statusIngresso === 'anulada' ? 'registration-status-cancelled' : ''}`}>
                                  Ingresso {statusIngresso === 'anulada' ? 'anulado' : 'confirmado'}
                                </span>
                              </span>
                            </div>
                          </td>
                          <td>{participante.ministerio_nome || 'Não informado'}</td>
                          <td><span className="due-date">Dia {participante.dia_vencimento}</span></td>
                          <td>
                            {pagamentos.length > 0 ? (
                              <details className="payment-history">
                                <summary>{pagamentos.length} {pagamentos.length === 1 ? 'pagamento' : 'pagamentos'}</summary>
                                <ul className="payment-history-list">
                                  {pagamentos.map((pagamento, index) => (
                                    <li key={`${pagamento.data}-${index}`}>
                                      <span>{pagamento.data}</span>
                                      <strong>{formatarMoeda(pagamento.valor)}</strong>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : <span className="history-empty">Nenhum pagamento</span>}
                          </td>
                          <td>
                            <span className={`balance ${participante.saldo_devedor > 0 ? 'balance-pending' : 'balance-paid'}`}>
                              {formatarMoeda(participante.saldo_devedor)}
                            </span>
                            {participante.saldo_devedor <= 0 && <span className="paid-label">Quitado</span>}
                          </td>
                          <td>
                            <div className="row-actions">
                              {statusIngresso === 'confirmada' && participante.saldo_devedor > 0
                                ? <button className="button button-small button-pay" onClick={() => abrirModal(participante)}>Registrar pagamento</button>
                                : statusIngresso === 'confirmada'
                                  ? <span className="paid-check" aria-label="Pagamento quitado">✓</span>
                                  : null}
                              {statusIngresso === 'confirmada'
                                ? <button className="icon-button whatsapp-button" onClick={() => handleLembreteWhatsApp(participante)} aria-label={`Enviar lembrete para ${participante.nome}`} title="Enviar lembrete pelo WhatsApp">↗</button>
                                : null}
                              <button
                                className={`button button-small ${statusIngresso === 'anulada' ? 'button-pay' : 'button-cancel-registration'}`}
                                onClick={() => atualizarStatusIngresso(participante, statusIngresso === 'anulada' ? 'confirmada' : 'anulada')}
                                aria-label={`${statusIngresso === 'anulada' ? 'Confirmar ingresso' : 'Registrar desistência'} de ${participante.nome}`}
                              >
                                {statusIngresso === 'anulada' ? 'Confirmar' : 'Desistência'}
                              </button>
                              <button className="icon-button delete-button" onClick={() => handleExcluir(participante.id, participante.nome)} aria-label={`Excluir ${participante.nome}`} title="Excluir participante">×</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {participantesFiltrados.length === 0 && (
                      <tr>
                        <td className="empty-state" colSpan="6">
                          <span className="empty-icon" aria-hidden="true">⌕</span>
                          <strong>{termoPesquisa ? 'Nenhum resultado encontrado' : 'Ainda não há participantes'}</strong>
                          <span>{termoPesquisa ? 'Tente buscar por outro nome.' : 'Cadastre o primeiro participante para começar.'}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <span>Exibindo <strong>{participantesFiltrados.length}</strong> de <strong>{participantes.length}</strong> inscrições · <strong>{participantesConfirmados.length}</strong> confirmadas</span>
                <span>Atualizado em tempo real <span className="status-dot" /></span>
              </div>
            </section>

            <article className="panel registration-panel" id="novo-participante">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">INSCRIÇÕES</span>
                  <h2>Novo participante</h2>
                  <p>Preencha os dados para adicionar uma inscrição.</p>
                </div>
                <span className="panel-heading-icon" aria-hidden="true">👤</span>
              </div>

              <form className="registration-form" onSubmit={(event) => { event.preventDefault(); handleSalvar(); }}>
                <label className="field field-full">
                  <span>Nome completo <span className="required">*</span></span>
                  <input type="text" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Ana Silva" autoComplete="name" required />
                </label>
                <label className="field field-full">
                  <span>E-mail</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@exemplo.com.br" autoComplete="email" />
                </label>
                <label className="field field-full">
                  <span>Celular</span>
                  <input type="tel" value={celular} onChange={(event) => setCelular(formatarCelular(event.target.value))} placeholder="(11) 99999-9999" autoComplete="tel" />
                </label>
                <label className="field field-full">
                  <span>Ministério responsável <span className="required">*</span></span>
                  <select
                    value={ministerioSelecionado}
                    onChange={(event) => setMinisterioSelecionado(event.target.value)}
                    disabled={carregandoMinisterios || ministeriosAtivos.length === 0}
                    required
                  >
                    {ministeriosAtivos.length === 0
                      ? <option value="">{carregandoMinisterios ? 'Carregando ministérios...' : 'Cadastre um ministério para continuar'}</option>
                      : ministeriosAtivos.map((ministerio) => <option key={ministerio.id} value={ministerio.id}>{ministerio.nome}</option>)}
                  </select>
                  {!carregandoMinisterios && ministeriosAtivos.length === 0 && (
                    <small className="field-hint">Cadastre e habilite pelo menos um ministério para fazer inscrições.</small>
                  )}
                </label>
                <label className="field field-full">
                  <span className="field-label-row">
                    <span>Lote</span>
                    <button className="text-button" type="button" onClick={() => setModalLotesAberto(true)}>Gerenciar lotes</button>
                  </span>
                  <select
                    value={loteSelecionado}
                    onChange={(event) => setLoteSelecionado(event.target.value)}
                    disabled={carregandoLotes || lotesAtivos.length === 0}
                    required
                  >
                    {lotesAtivos.length === 0
                      ? <option value="">{carregandoLotes ? 'Carregando lotes...' : 'Cadastre um lote para continuar'}</option>
                      : lotesAtivos.map((lote) => <option key={lote.id} value={lote.id}>{lote.nome} · {formatarMoeda(lote.valor)}</option>)}
                  </select>
                  {!carregandoLotes && lotesAtivos.length === 0 && (
                    <small className="field-hint">Cadastre e habilite pelo menos um lote para fazer inscrições.</small>
                  )}
                </label>
                <div className="field-row field-full">
                  <label className="field">
                    <span>Parcelas <span className="required">*</span></span>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={parcelas}
                      onChange={(event) => {
                        const valor = event.target.value;
                        if (valor === '') setParcelas('');
                        else if (Number(valor) > 12) setParcelas(12);
                        else if (Number(valor) < 1) setParcelas(1);
                        else setParcelas(Number(valor));
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Vencimento (dia) <span className="required">*</span></span>
                    <select value={diaVencimento} onChange={(event) => setDiaVencimento(event.target.value)} required>
                      <option value="">Selecione o dia</option>
                      {diasVencimento.map((dia) => <option key={dia} value={dia}>{dia}</option>)}
                    </select>
                  </label>
                </div>
                <div className="installment-preview field-full">
                  <span className="preview-icon" aria-hidden="true">▤</span>
                  <span><small>Valor por parcela</small><strong>{formatarMoeda(Number(valorParcela))}</strong></span>
                  <span className="preview-count">{parcelas || 0}x</span>
                </div>
                <button className="button button-primary submit-button field-full" type="submit">Cadastrar participante <span aria-hidden="true">→</span></button>
                <p className="form-note field-full"><span className="required">*</span> Campos obrigatórios</p>
              </form>
            </article>

            <section className="panel ministry-panel" id="ministerios">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">ORGANIZAÇÃO</span>
                  <h2>Ministérios</h2>
                  <p>Cadastre os ministérios responsáveis pelos eventos e inscrições.</p>
                </div>
                <span className="panel-heading-icon" aria-hidden="true">◇</span>
              </div>
              <form className="ministry-form" onSubmit={handleSalvarMinisterio}>
                <label className="field">
                  <span>Nome do ministério</span>
                  <input
                    type="text"
                    value={nomeNovoMinisterio}
                    onChange={(event) => setNomeNovoMinisterio(event.target.value)}
                    placeholder="Ex.: Ministério A"
                    required
                  />
                </label>
                <button className="button button-primary ministry-submit" type="submit">Cadastrar ministério <span aria-hidden="true">＋</span></button>
              </form>
              {ministerios.length > 0 ? (
                <ul className="ministry-list">
                  {ministerios.map((ministerio) => (
                    <li className={`ministry-row ${ministerio.ativo ? '' : 'ministry-disabled'}`} key={ministerio.id}>
                      {ministerioEmEdicao?.id === ministerio.id ? (
                        <form className="catalog-edit-form ministry-edit-form" onSubmit={salvarEdicaoMinisterio}>
                          <label className="field">
                            <span>Nome do ministério</span>
                            <input
                              type="text"
                              value={ministerioEmEdicao.nome}
                              onChange={(event) => setMinisterioEmEdicao({ ...ministerioEmEdicao, nome: event.target.value })}
                              autoFocus
                              required
                            />
                          </label>
                          <div className="catalog-actions">
                            <button className="button button-small button-secondary" type="button" onClick={cancelarEdicaoMinisterio}>Cancelar</button>
                            <button className="button button-small button-primary" type="submit">Salvar</button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <span className="ministry-details">
                            <strong>{ministerio.nome}</strong>
                            <small>{ministerio.ativo ? 'Disponível nas inscrições' : 'Desabilitado para novas inscrições'}</small>
                          </span>
                          <div className="catalog-actions">
                            <button className="button button-small button-secondary" type="button" onClick={() => iniciarEdicaoMinisterio(ministerio)}>Editar</button>
                            <button
                              className={`catalog-switch ${ministerio.ativo ? 'catalog-switch-on' : ''}`}
                              type="button"
                              onClick={() => alternarMinisterio(ministerio)}
                              role="switch"
                              aria-checked={ministerio.ativo}
                              aria-label={`${ministerio.ativo ? 'Desabilitar' : 'Habilitar'} ministério ${ministerio.nome}`}
                              title={ministerio.ativo ? 'Desabilitar ministério' : 'Habilitar ministério'}
                            >
                              <span className="catalog-switch-thumb" />
                            </button>
                            <button className="button button-small button-cancel-registration" type="button" onClick={() => excluirMinisterio(ministerio)}>Excluir</button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ministry-empty">
                  {carregandoMinisterios ? 'Carregando ministérios...' : 'Nenhum ministério cadastrado. Adicione o primeiro para habilitar as inscrições.'}
                </p>
              )}
            </section>
          </section>
          <footer className="page-footer">Acampa <span>·</span> Gestão simples, momentos inesquecíveis.</footer>
        </div>
      </main>

      {modalPagamento.aberto && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) fecharModal(); }}>
          <section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
            <div className="modal-heading">
              <span className="modal-icon" aria-hidden="true">↗</span>
              <button className="modal-close" onClick={fecharModal} aria-label="Fechar">×</button>
              <span className="section-kicker">FINANCEIRO</span>
              <h2 id="payment-title">Registrar pagamento</h2>
              <p>Confirme o valor recebido de <strong>{modalPagamento.participante?.nome}</strong>.</p>
            </div>
            <div className="modal-balance">
              <span>Saldo em aberto</span>
              <strong>{formatarMoeda(modalPagamento.participante?.saldo_devedor)}</strong>
            </div>
            <div className="payment-options">
              <label className={`payment-option ${modalPagamento.tipo === 'fixo' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="tipo_pagamento"
                  checked={modalPagamento.tipo === 'fixo'}
                  onChange={() => setModalPagamento({ ...modalPagamento, tipo: 'fixo' })}
                />
                <span className="radio-custom" />
                <span><strong>Parcela fixa</strong><small>Valor da parcela cadastrada</small></span>
                <b>{formatarMoeda(modalPagamento.participante?.valor_parcela)}</b>
              </label>
              <label className={`payment-option ${modalPagamento.tipo === 'avista' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="tipo_pagamento"
                  checked={modalPagamento.tipo === 'avista'}
                  onChange={() => setModalPagamento({ ...modalPagamento, tipo: 'avista' })}
                />
                <span className="radio-custom" />
                <span><strong>Pagamento à vista</strong><small>Quitar todo o saldo pendente</small></span>
                <b>{formatarMoeda(modalPagamento.participante?.saldo_devedor)}</b>
              </label>
              <label className={`payment-option ${modalPagamento.tipo === 'outro' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="tipo_pagamento"
                  checked={modalPagamento.tipo === 'outro'}
                  onChange={() => setModalPagamento({ ...modalPagamento, tipo: 'outro' })}
                />
                <span className="radio-custom" />
                <span><strong>Outro valor</strong><small>Informar valor recebido</small></span>
              </label>
            </div>
            {modalPagamento.tipo === 'outro' && (
              <label className="field modal-value-field">
                <span>Valor recebido</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={modalPagamento.valorPersonalizado}
                  onChange={(event) => setModalPagamento({ ...modalPagamento, valorPersonalizado: event.target.value })}
                  placeholder="0,00"
                  autoFocus
                />
              </label>
            )}
            <div className="modal-actions">
              <button className="button button-secondary" onClick={fecharModal}>Cancelar</button>
              <button className="button button-primary" onClick={confirmarPagamento}>Confirmar pagamento <span aria-hidden="true">→</span></button>
            </div>
          </section>
        </div>
      )}

      {modalExclusaoTodas.aberto && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) fecharModalExclusaoTodas();
          }}
        >
          <section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="delete-all-title">
            <div className="modal-heading">
              <span className="modal-icon bulk-delete-icon" aria-hidden="true">!</span>
              {!modalExclusaoTodas.carregando && !modalExclusaoTodas.excluindo && (
                <button className="modal-close" type="button" onClick={fecharModalExclusaoTodas} aria-label="Fechar">×</button>
              )}
              <span className="section-kicker">ATENÇÃO</span>
              <h2 id="delete-all-title">Excluir todas as inscrições?</h2>
              {modalExclusaoTodas.carregando ? (
                <p>Carregando a lista atual de participantes...</p>
              ) : (
                <p>
                  {modalExclusaoTodas.ids.length > 0
                    ? <>Esta ação excluirá permanentemente <strong>{modalExclusaoTodas.ids.length} {modalExclusaoTodas.ids.length === 1 ? 'participante' : 'participantes'}</strong> {modalExclusaoTodas.ids.length === 1 ? 'cadastrado' : 'cadastrados'} neste momento. Não é possível desfazer.</>
                    : 'Não há participantes cadastrados para excluir.'}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={fecharModalExclusaoTodas}
                disabled={modalExclusaoTodas.carregando || modalExclusaoTodas.excluindo}
              >
                Cancelar
              </button>
              <button
                className="button button-cancel-registration"
                type="button"
                onClick={excluirTodasInscricoes}
                disabled={modalExclusaoTodas.carregando || modalExclusaoTodas.excluindo || modalExclusaoTodas.ids.length === 0}
              >
                {modalExclusaoTodas.excluindo ? 'Excluindo...' : 'Excluir inscrições'}
              </button>
            </div>
          </section>
        </div>
      )}

      {modalLotesAberto && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalLotesAberto(false); }}>
          <section className="payment-modal lot-manager-modal" role="dialog" aria-modal="true" aria-labelledby="lots-title">
            <div className="modal-heading">
              <span className="modal-icon" aria-hidden="true">▤</span>
              <button className="modal-close" type="button" onClick={() => setModalLotesAberto(false)} aria-label="Fechar">×</button>
              <span className="section-kicker">INSCRIÇÕES</span>
              <h2 id="lots-title">Gerenciar lotes</h2>
              <p>Cadastre valores e escolha quais aparecem nas novas inscrições.</p>
            </div>

            <form className="lot-form" onSubmit={handleSalvarLote}>
              <label className="field">
                <span>Nome do lote</span>
                <input
                  type="text"
                  value={nomeNovoLote}
                  onChange={(event) => setNomeNovoLote(event.target.value)}
                  placeholder="Ex.: Lote promocional"
                  required
                />
              </label>
              <label className="field">
                <span>Valor</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={valorNovoLote}
                  onChange={(event) => setValorNovoLote(event.target.value)}
                  placeholder="0,00"
                  required
                />
              </label>
              <button className="button button-primary lot-submit" type="submit">Cadastrar lote <span aria-hidden="true">＋</span></button>
            </form>

            <div className="lot-list-heading">
              <strong>Lotes cadastrados</strong>
              <span>{lotes.length}</span>
            </div>
            {lotes.length > 0 ? (
              <ul className="lot-list">
                {lotes.map((lote) => (
                  <li className={`lot-row ${lote.ativo ? '' : 'lot-disabled'}`} key={lote.id}>
                    {loteEmEdicao?.id === lote.id ? (
                      <form className="catalog-edit-form lot-edit-form" onSubmit={salvarEdicaoLote}>
                        <label className="field">
                          <span>Nome do lote</span>
                          <input
                            type="text"
                            value={loteEmEdicao.nome}
                            onChange={(event) => setLoteEmEdicao({ ...loteEmEdicao, nome: event.target.value })}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>Valor</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={loteEmEdicao.valor}
                            onChange={(event) => setLoteEmEdicao({ ...loteEmEdicao, valor: event.target.value })}
                            required
                          />
                        </label>
                        <div className="catalog-actions">
                          <button className="button button-small button-secondary" type="button" onClick={cancelarEdicaoLote}>Cancelar</button>
                          <button className="button button-small button-primary" type="submit">Salvar</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <span className="lot-details">
                          <strong>{lote.nome}</strong>
                          <small>{formatarMoeda(lote.valor)} · {lote.ativo ? 'Disponível nas inscrições' : 'Desabilitado'}</small>
                        </span>
                        <div className="catalog-actions">
                          <button className="button button-small button-secondary" type="button" onClick={() => iniciarEdicaoLote(lote)}>Editar</button>
                          <button
                            className={`catalog-switch ${lote.ativo ? 'catalog-switch-on' : ''}`}
                            type="button"
                            onClick={() => alternarLote(lote)}
                            role="switch"
                            aria-checked={lote.ativo}
                            aria-label={`${lote.ativo ? 'Desabilitar' : 'Habilitar'} lote ${lote.nome}`}
                            title={lote.ativo ? 'Desabilitar lote' : 'Habilitar lote'}
                          >
                            <span className="catalog-switch-thumb" />
                          </button>
                          <button className="button button-small button-cancel-registration" type="button" onClick={() => excluirLote(lote)}>Excluir</button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lot-empty">Nenhum lote cadastrado. Adicione o primeiro usando o formulário acima.</p>
            )}
          </section>
        </div>
      )}
      {relatorioImpressao && (
        <section className="print-report" aria-label="Relatório de participantes para impressão">
          <header className="print-report-header">
            <div>
              <p className="print-report-kicker">ACAMPA · CONTROLE DE PRESENÇA</p>
              <h1>Lista de participantes</h1>
              <p>Gerado em {relatorioImpressao.geradoEm}</p>
            </div>
            <div className="print-report-summary">
              <strong>{relatorioImpressao.participantes.length}</strong>
              <span>{relatorioImpressao.participantes.length === 1 ? 'participante' : 'participantes'}</span>
            </div>
          </header>
          {relatorioImpressao.filtros.length > 0 && (
            <p className="print-report-filters">
              <strong>Filtros aplicados:</strong> {relatorioImpressao.filtros.join(' · ')}
            </p>
          )}
          <p className="print-report-instructions">Marque a caixa ao lado do nome para registrar a presença no evento.</p>
          <table className="print-report-table">
            <thead>
              <tr>
                <th className="print-checkin-column">Presença</th>
                <th>Participante / ID</th>
                <th>Contato</th>
                <th>Ministério</th>
                <th>Vencimento</th>
                <th>Status do ingresso</th>
              </tr>
            </thead>
            <tbody>
              {relatorioImpressao.participantes.map((participante) => (
                <tr key={participante.id}>
                  <td className="print-checkin-cell"><span className="print-check-box" /></td>
                  <td>
                    <strong>{participante.nome || 'Nome não informado'}</strong>
                    <small>{participante.id}</small>
                  </td>
                  <td>
                    <span>{participante.celular || 'Celular não informado'}</span>
                    {participante.email && <small>{participante.email}</small>}
                  </td>
                  <td>{participante.ministerio_nome || 'Não informado'}</td>
                  <td>{participante.dia_vencimento ? `Dia ${participante.dia_vencimento}` : 'Não informado'}</td>
                  <td>{participante.status_ingresso === 'anulada' ? 'Anulado' : 'Confirmado'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="print-report-footer">
            Acampa · Gestão de inscrições
          </footer>
        </section>
      )}
    </div>
  );
}
