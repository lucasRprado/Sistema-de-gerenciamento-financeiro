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
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import logo from './assets/logo.png';
import './App.css';

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const diasVencimento = [1, 5, 10, 15, 20, 25, 30];

const formatarMoeda = (valor) => moeda.format(valor || 0);
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
  const [lotes, setLotes] = useState([]);
  const [loteSelecionado, setLoteSelecionado] = useState('');
  const [carregandoLotes, setCarregandoLotes] = useState(true);
  const [modalLotesAberto, setModalLotesAberto] = useState(false);
  const [nomeNovoLote, setNomeNovoLote] = useState('');
  const [valorNovoLote, setValorNovoLote] = useState('');
  const [parcelas, setParcelas] = useState(1);
  const [diaVencimento, setDiaVencimento] = useState('');
  const [participantes, setParticipantes] = useState([]);
  const [termoPesquisa, setTermoPesquisa] = useState('');
  const [usuario, setUsuario] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);
  const [emailLogin, setEmailLogin] = useState('');
  const [senhaLogin, setSenhaLogin] = useState('');
  const [carregandoLogin, setCarregandoLogin] = useState(false);
  const [erroLogin, setErroLogin] = useState('');
  const [notificacao, setNotificacao] = useState(null);
  const proximoIdNotificacao = useRef(0);
  const [modalPagamento, setModalPagamento] = useState({
    aberto: false,
    participante: null,
    tipo: 'fixo',
    valorPersonalizado: '',
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

  const lotesAtivos = lotes.filter((lote) => lote.ativo);
  const loteAtual = lotesAtivos.find((lote) => lote.id === loteSelecionado);
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

  const handleEntrar = async (event) => {
    event.preventDefault();
    setErroLogin('');
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

  const handleSair = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Erro ao sair: ', error);
      mostrarNotificacao('Não foi possível encerrar a sessão. Tente novamente.', 'erro');
    }
  };

  const totalEsperado = participantes.reduce((acc, participante) => acc + (participante.valor_total || 0), 0);
  const totalPendente = participantes.reduce((acc, participante) => acc + (participante.saldo_devedor || 0), 0);
  const totalRecebido = totalEsperado - totalPendente;
  const participantesFiltrados = participantes.filter((participante) =>
    participante.nome.toLowerCase().includes(termoPesquisa.toLowerCase()),
  );
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

  const handleSalvar = async () => {
    if (!nome || !diaVencimento || !parcelas || !loteAtual) {
      if (!loteAtual) {
        mostrarNotificacao('Cadastre e habilite um lote antes de adicionar participantes.', 'erro');
        return;
      }
      mostrarNotificacao('Por favor, preencha os campos obrigatórios (nome, parcelas e dia de vencimento).', 'erro');
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
        email,
        celular,
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
      setDiaVencimento('');
      setParcelas(1);
      mostrarNotificacao('Participante cadastrado com sucesso.');
    } catch (error) {
      console.error('Erro ao guardar documento: ', error);
      mostrarNotificacao('Erro ao guardar os dados.', 'erro');
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
                onChange={(event) => setEmailLogin(event.target.value)}
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
            <button className="button button-primary auth-submit" type="submit" disabled={carregandoLogin}>
              {carregandoLogin ? 'Entrando...' : 'Entrar'}
              {!carregandoLogin && <span aria-hidden="true">→</span>}
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
          <span className="brand-copy"><strong>acampa</strong><small>gestão do acampamento</small></span>
        </a>

        <div className="sidebar-label">MENU PRINCIPAL</div>
        <nav className="side-nav" aria-label="Navegação principal">
          <a className="nav-link active" href="#inicio"><span aria-hidden="true">▦</span> Visão geral</a>
          <a className="nav-link" href="#participantes"><span aria-hidden="true">♧</span> Participantes</a>
          <a className="nav-link" href="#novo-participante"><span aria-hidden="true">＋</span> Novo cadastro</a>
        </nav>

        <div className="sidebar-bottom">
          <div className="camp-card">
            <div className="camp-icon" aria-hidden="true">✳</div>
            <strong>Seu acampamento</strong>
            <span>Uma experiência para guardar.</span>
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
            <a className="button button-primary welcome-action" href="#novo-participante"><span aria-hidden="true">＋</span> Novo participante</a>
          </section>

          <section className="metrics-grid" aria-label="Resumo financeiro">
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
            <article className="panel registration-panel" id="novo-participante">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">INSCRIÇÕES</span>
                  <h2>Novo participante</h2>
                  <p>Preencha os dados para adicionar uma inscrição.</p>
                </div>
                <span className="panel-heading-icon" aria-hidden="true">＋</span>
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

            <section className="panel participants-panel" id="participantes">
              <div className="participants-heading">
                <div>
                  <span className="section-kicker">ACOMPANHAMENTO</span>
                  <h2>Participantes <span className="count-badge">{participantes.length}</span></h2>
                  <p>Gerencie inscrições e pagamentos.</p>
                </div>
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
              </div>

              <div className="table-scroll">
                <table className="participants-table">
                  <thead>
                    <tr>
                      <th>PARTICIPANTE</th>
                      <th>VENCIMENTO</th>
                      <th>HISTÓRICO</th>
                      <th>SALDO PENDENTE</th>
                      <th><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participantesFiltrados.map((participante) => {
                      const pagamentos = participante.historico_pagamentos || [];
                      return (
                        <tr key={participante.id}>
                          <td>
                            <div className="participant-cell">
                              <span className="participant-avatar">{participante.nome?.trim().charAt(0).toUpperCase() || '?'}</span>
                              <span className="participant-info">
                                <strong>{participante.nome}</strong>
                                <small>{participante.email || participante.id}</small>
                              </span>
                            </div>
                          </td>
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
                              {participante.saldo_devedor > 0
                                ? <button className="button button-small button-pay" onClick={() => abrirModal(participante)}>Registrar pagamento</button>
                                : <span className="paid-check" aria-label="Pagamento quitado">✓</span>}
                              <button className="icon-button whatsapp-button" onClick={() => handleLembreteWhatsApp(participante)} aria-label={`Enviar lembrete para ${participante.nome}`} title="Enviar lembrete pelo WhatsApp">↗</button>
                              <button className="icon-button delete-button" onClick={() => handleExcluir(participante.id, participante.nome)} aria-label={`Excluir ${participante.nome}`} title="Excluir participante">×</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {participantesFiltrados.length === 0 && (
                      <tr>
                        <td className="empty-state" colSpan="5">
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
                <span>Exibindo <strong>{participantesFiltrados.length}</strong> de <strong>{participantes.length}</strong> participantes</span>
                <span>Atualizado em tempo real <span className="status-dot" /></span>
              </div>
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
                    <span className="lot-details">
                      <strong>{lote.nome}</strong>
                      <small>{formatarMoeda(lote.valor)} · {lote.ativo ? 'Disponível nas inscrições' : 'Desabilitado'}</small>
                    </span>
                    <button
                      className={`button button-small ${lote.ativo ? 'button-secondary' : 'button-pay'}`}
                      type="button"
                      onClick={() => alternarLote(lote)}
                    >
                      {lote.ativo ? 'Desabilitar' : 'Habilitar'}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lot-empty">Nenhum lote cadastrado. Adicione o primeiro usando o formulário acima.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
