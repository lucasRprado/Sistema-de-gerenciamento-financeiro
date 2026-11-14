# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Login do painel

O painel usa autenticação por e-mail e senha do Firebase. No Firebase Console, ative o provedor **E-mail/senha** em Authentication e crie as contas autorizadas na lista de usuários. O aplicativo não oferece cadastro público.

A tela de login bloqueia o acesso à interface e os listeners do Firestore enquanto não há uma sessão autenticada. Configure também as regras do Firestore para exigir `request.auth != null`; a proteção da interface, sozinha, não impede acesso direto ao banco.

## Gerenciamento de lotes

Os lotes são cadastrados pelo painel em **Gerenciar lotes** e ficam salvos na coleção `Lotes` do Firestore. Cada lote tem nome, valor e status de disponibilidade; somente lotes habilitados aparecem no cadastro de participantes. As regras do Firestore devem permitir que usuários autenticados leiam e alterem essa coleção, assim como a coleção `Participantes`.

## Gerenciamento de eventos

Os eventos são cadastrados em **Gerenciar eventos** e ficam salvos na coleção `Eventos` do Firestore. Cada evento pertence a um único ministério por meio do campo `ministerio_id`; um ministério pode ter vários eventos. Nas inscrições, somente eventos habilitados do ministério selecionado ficam disponíveis. As inscrições guardam `evento_id` e `evento_nome`; ao excluir um evento, o vínculo é removido e o nome permanece como histórico. As regras do Firestore devem permitir que usuários autenticados leiam e alterem essa coleção.
