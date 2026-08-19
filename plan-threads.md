# Task: Implementar Nova Aba "Threads"

## Visão Geral
Implementar uma nova aba **"Threads"** para discussões colaborativas nativas ao Git, integrada ao GitHub Desktop (fork desktop-claw). A aba ficará na **segunda linha** da barra lateral, junto com **Files** e **Agent**.

---

## Reorganização das Abas (Sidebar)

### Linha 1 (Superior)
| Aba | Ícone | Descrição |
|-----|-------|-----------|
| **Changes** | 📝 | Alterações pendentes (staging, commit) |
| **History** | 🕐 | Histórico de commits do repositório |
| **Compare** | ⚖️ | Comparação de branches/tags |

### Linha 2 (Inferior) — **Nova organização**
| Aba | Ícone | Descrição |
|-----|-------|-----------|
| **Files** | 📁 | Explorador de arquivos do repositório |
| **Threads** | 💬 | **NOVA** — Discussões colaborativas (este plano) |
| **Agent** | 🤖 | Integração com OpenCode/AI |

> **Nota:** A aba "History" substitui "Hystory" (correção de ortografia).

---

## Implementação do Layout da Sidebar (2 Linhas)

### Análise Atual
A sidebar atual (`app/src/ui/sidebar/` ou similar) renderiza as abas em uma única linha horizontal. Precisamos mudar para **duas linhas de 3 abas cada**.

### Arquivos a Modificar (Estimados)
| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `app/src/ui/sidebar/Sidebar.tsx` (ou similar) | Layout: flex-direction column, dois containers `.sidebar-row` |
| `app/src/ui/sidebar/TabBar.tsx` (ou similar) | Dividir tabs em dois grupos: `primaryTabs` e `secondaryTabs` |
| `app/styles/ui/_sidebar.scss` (ou similar) | CSS Grid/Flexbox para 2 linhas × 3 colunas |
| `app/src/ui/sidebar/SidebarItem.tsx` | Ajustar padding/ícones para caber 2 linhas |
| `app/src/main-process/` | Possível ajuste no estado da janela (altura mínima) |

### Estrutura CSS Proposta
```scss
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-row {
  display: flex;
  flex: 0 0 auto;           // não cresce
  gap: 2px;                 // espaçamento entre abas
  
  &.primary {               // Linha 1: Changes, History, Compare
    border-bottom: 1px solid var(--border-subtle);
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  
  &.secondary {             // Linha 2: Files, Threads, Agent
    // sem border-bottom
  }
}

.sidebar-tab {
  flex: 1 1 0;              // divide igualmente (33.33% cada)
  min-width: 0;             // permite encolher
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 4px;
  border-radius: 6px;
  transition: background 0.15s;
  
  &:hover { background: var(--bg-hover); }
  &.active { background: var(--bg-selected); }
  
  // Responsivo: em janelas muito estreitas, pode virar scroll horizontal
  @media (max-width: 280px) {
    .sidebar-row { flex-wrap: nowrap; overflow-x: auto; }
  }
}
```

### Lógica de Abas (TypeScript)
```typescript
// Definição centralizada das abas (ex: app/src/ui/sidebar/tabs.ts)
export const PRIMARY_TABS: readonly TabConfig[] = [
  { id: 'changes', label: 'Changes', icon: 'diff', tooltip: 'Alterações pendentes' },
  { id: 'history', label: 'History', icon: 'history', tooltip: 'Histórico de commits' },
  { id: 'compare', label: 'Compare', icon: 'git-compare', tooltip: 'Comparar branches' },
] as const;

export const SECONDARY_TABS: readonly TabConfig[] = [
  { id: 'files', label: 'Files', icon: 'repo', tooltip: 'Explorador de arquivos' },
  { id: 'threads', label: 'Threads', icon: 'comment-discussion', tooltip: 'Discussões colaborativas' },
  { id: 'agent', label: 'Agent', icon: 'copilot', tooltip: 'OpenCode AI Assistant' },
] as const;

export type TabId = (typeof PRIMARY_TABS)[number]['id'] | (typeof SECONDARY_TABS)[number]['id'];
```

### Integração com Estado Atual
- **AppStore**: Adicionar `activeTab: TabId` (já deve existir)
- **Dispatcher**: Actions `selectTab(tabId)` já devem existir
- **Persistência**: Salvar `activeTab` no localStorage/config
- **Teclado**: `Ctrl+1/2/3` → linha 1; `Ctrl+Shift+1/2/3` → linha 2 (ou similar)

### Acessibilidade
- `role="tablist"` em cada `.sidebar-row`
- `role="tab"` em cada `.sidebar-tab`
- `aria-selected`, `aria-controls`, `id`/`aria-labelledby` corretos
- Navegação por setas (←/→ dentro da linha, ↑/↓ entre linhas)

---

## Estrutura de Dados (Git-Native)

### Branch Dedicada
- **Nome:** `desktop-claw-threads` (branch órfã ou separada do histórico principal)
- **Escopo:** Um branch por repositório local

### Estrutura de Pastas
```
desktop-claw-threads/
├── {thread-id}-{slug-title}/
│   ├── index.json              # Metadados do thread
│   ├── YYYY-MM-DD.jsonl        # Mensagens do dia (JSON Lines)
│   └── attachments/
│       └── {timestamp}/        # Anexos por mensagem
│           └── {arquivo.ext}
```

### `index.json` (Metadados do Thread)
```json
{
  "id": "thread-uuid-v4",
  "title": "Título do Thread",
  "slug": "titulo-do-thread",
  "tags": ["tag1", "tag2"],
  "created_at": "2026-08-19T10:30:00.000Z",
  "updated_at": "2026-08-19T15:45:00.000Z",
  "author": "username",
  "message_count": 42
}
```

### Formato das Mensagens (`YYYY-MM-DD.jsonl`)
Cada linha é um JSON válido (JSONL):
```json
{"author":"Gabriel","timestamp":"2026-08-19T10:30:00.000Z","content":"Mensagem em **markdown**","hash":"sha256...","attachments":["attachments/2026-08-19T10:30:00.000Z/imagem.png"]}
{"author":"Carol","timestamp":"2026-08-19T10:35:00.000Z","content":"Resposta","hash":"sha256...","attachments":[]}
```

**Campos:**
- `author`: string (nome do autor)
- `timestamp`: ISO 8601 string
- `content`: string (markdown)
- `hash`: string (SHA256 do conteúdo para integridade)
- `attachments`: array de strings (caminhos relativos dos anexos)

> **Removido:** campo `encrypted` (conforme solicitado)

---

## Funcionalidades da UI

### 1. Lista de Threads (Painel Esquerdo)
- [ ] Carregar threads da raiz do branch `desktop-claw-threads`
- [ ] Exibir: título, tags, contagem de mensagens, última atividade
- [ ] **Badge de não lidas**: comparar hash local (último lido) vs remoto (HEAD do branch)
- [ ] Botão **"+"** → Modal de criação (Título + Tags)
- [ ] Ordenação: mais recente primeiro (por `updated_at`)
- [ ] Filtro por tags (multi-select)
- [ ] Busca por título/conteúdo

### 2. Visualizador de Chat (Painel Central)
- [ ] Carregar `YYYY-MM-DD.jsonl` da thread selecionada (data atual por padrão)
- [ ] **Scroll infinito/virtualizado** para performance (carregar dias anteriores sob demanda)
- [ ] Renderizar markdown (GitHub Flavored Markdown)
- [ ] Exibir: avatar (iniciais do autor), autor, timestamp formatado, conteúdo
- [ ] **Ações por mensagem** (clique direito ou menu `⋮`):
  - Copiar conteúdo
  - Editar → gera commit: `Edit message {hash} from thread {thread-id} - {timestamp}`
  - Excluir → gera commit: `Delete message {hash} from thread {thread-id} - {timestamp}`
  - Ver detalhes (hash, timestamp, anexos)
- [ ] **Comandos Slash (`/`)** no input:
  - `/edit {hash}` — pré-preenche edição
  - `/delete {hash}` — confirma exclusão
  - `/attach` — abre seletor de arquivo
  - `/reply {hash}` — cita mensagem
  - `/askAI {pergunta}` — envia para OpenCode (read-only), adiciona resposta como mensagem do "Assistant"

### 3. Input de Mensagem (Rodapé)
- [ ] Textarea com suporte a markdown (atalhos: `Ctrl+B`, `Ctrl+I`, `` ` ``, etc.)
- [ ] Botão **Anexar** (📎) → seletor de arquivos → salva em `attachments/{timestamp}/`
- [ ] Botão **Enviar** (Enter) / **Nova linha** (Shift+Enter)
- [ ] Ao enviar:
  1. Append no `YYYY-MM-DD.jsonl` do dia
  2. `git add` + `git commit` (msg: `Update thread {thread-id} - {timestamp}`)
  3. `git push` para `desktop-claw-threads`
  4. Atualização otimista da UI (não aguardar push)

### 4. Sincronização (Polling)
- [ ] `git fetch` periódico no branch `desktop-claw-threads`
- [ ] Intervalo configurável: **5s, 10s, 30s, 1min** (padrão: 30s)
- [ ] Detectar novos commits em `threads/`
- [ ] `git pull` com merge automático de JSONL (append-only = sem conflitos na maioria dos casos)
- [ ] Se conflito: merge manual + commit `Merge thread {thread-id} - {timestamp}`
- [ ] Atualizar UI em tempo real (novas mensagens, badges, lista)

---

## Tela de Configurações
**Localização:** Após as configurações de AI

| Configuração | Tipo | Padrão | Descrição |
|--------------|------|--------|-----------|
| **Polling Interval** | Select | 30s | 5s, 10s, 30s, 1min |
| **Auto-fetch on focus** | Toggle | true | Fazer fetch ao focar a aba |
| **Show timestamps** | Toggle | true | Exibir hora completa vs relativa |
| **Compact mode** | Toggle | false | Mensagens mais densas |

---

## Regras de Commit (Branch `desktop-claw-threads`)

| Ação | Mensagem de Commit |
|------|-------------------|
| Nova mensagem / edição / exclusão / anexo | `Update thread {thread-id} - {ISO timestamp}` |
| Merge de conflitos | `Merge thread {thread-id} - {ISO timestamp}` |
| Criação de thread | `Create thread {thread-id} - {title}` |
| Exclusão de thread | `Delete thread {thread-id} - {title}` |

> **Importante:** Desabilitar revisão automática do OpenCode neste branch 

---

## Arquitetura Técnica (Resumo)

### Camadas
```
┌─────────────────────────────────────┐
│  UI (React) — ThreadsTab, ThreadList,│
│  ChatView, MessageInput, Settings   │
├─────────────────────────────────────┤
│  Store (AppStore/ThreadStore)       │
│  - threads[], activeThread, messages│
│  - unreadCounts, pollingTimer       │
├─────────────────────────────────────┤
│  Service: ThreadService             │
│  - listThreads(), getMessages()     │
│  - sendMessage(), editMessage()     │
│  - deleteMessage(), createThread()  │
│  - fetchRemote(), pullChanges()     │
├─────────────────────────────────────┤
│  Git Layer (dugite)                 │
│  - exec('fetch'), exec('pull')      │
│  - exec('add'), exec('commit')      │
│  - exec('push')                     │
├─────────────────────────────────────┤
│  FS Layer (Node.js fs/promises)     │
│  - read/write JSONL, index.json     │
│  - manage attachments/              │
└─────────────────────────────────────┘
```

### Integração com OpenCode (`/askAI`)
- OpenCode roda em modo **read-only** (sem acesso a ferramentas de escrita)
- Contexto: últimas N mensagens da thread + pergunta do usuário
- Resposta do OpenCode → nova mensagem com `author: "Assistant"`

---

## Fases de Implementação

### Fase 0: Layout da Sidebar (2 Linhas) — **Pré-requisito** ✅ **CONCLUÍDA**
- [x] Identificar arquivos da sidebar atual (`app/src/ui/repository.tsx`, `app/src/ui/tab-bar.tsx`)
- [x] Refatorar `TabBar` → novo componente `TwoRowTabBar` com duas linhas
- [x] Criar `ITabConfig` e configurações `primaryTabs`/`secondaryTabs` em `tab-bar.tsx`
- [x] Atualizar CSS/SCSS em `app/styles/ui/_tab-bar.scss` para grid 2×3 com `flex: 1 1 0`
- [x] Corrigir "Hystory" → "History" no label e tooltip
- [x] Testar responsividade (janela estreita → scroll horizontal)
- [x] Validar acessibilidade (ARIA roles, navegação por teclado ↑/↓/←/→, Home/End)
- [x] Garantir que `selectedTabId` funciona nas 6 abas
- [x] Adicionar `Threads` ao enum `RepositorySectionTab` em `app-state.ts`
- [x] Atualizar `AppStore._changeRepositorySection` para lidar com `Threads`
- [x] Adicionar `renderThreadsSidebar` e `renderThreadsContent` placeholders em `repository.tsx`
- [x] Build compila com sucesso (`yarn build:dev`)
- [x] Lint passa para o novo código (`yarn lint:src` - apenas erros pré-existentes)

### Fase 1: Fundação & Dados — ✅ **CONCLUÍDA**
- [x] Criar branch `desktop-claw-threads` (orphan branch via `ThreadService.ensureThreadsBranch`)
- [x] Implementar `ThreadService` (`app/src/lib/thread-service.ts`) — CRUD, branch mgmt, polling, conflict resolution
- [x] Modelos TypeScript: `IThread`, `IMessage`, `IThreadIndex`, `IThreadPollingConfig` (`app/src/models/thread.ts`)
- [x] `ThreadStore` (`app/src/lib/stores/thread-store.ts`) — state management com `_state`/`setState`
- [x] `ThreadStoreCache` (`app/src/lib/stores/thread-store-cache.ts`)
- [x] `AppStore` integration: `ensureThreadsBranch`, `getThreadStore`, `_loadThreads`, `_selectThread`, `_createThread`, `_sendThreadMessage`, `_editThreadMessage`, `_deleteThreadMessage`
- [x] `Dispatcher` methods: `loadThreads`, `selectThread`, `createThread`, `sendThreadMessage`, `editThreadMessage`, `deleteThreadMessage`, `loadOlderThreadMessages`, `setThreadPollingConfig`, `refreshThreads`

### Fase 2: UI — Lista de Threads — ✅ **CONCLUÍDA**
- [x] Componente `ThreadList` (`app/src/ui/threads/thread-list.tsx`) — lista, busca, criação inline
- [x] Modal `CreateThreadModal` (`app/src/ui/threads/create-thread-modal.tsx`)
- [x] Badge de não lidas (localStorage por thread: `lastReadHash`) — implementado no ThreadService
- [ ] Filtros avançados por tags — pendente

### Fase 3: UI — Chat View — ✅ **PARCIALMENTE CONCLUÍDA**
- [x] Componente `ChatView` (`app/src/ui/threads/chat-view.tsx`) — mensagens + infinite scroll
- [ ] Renderizador Markdown — **deferido** (react-markdown@8+ requer React 18; projeto usa React 16)
- [ ] Ações de mensagem (menu contextual) — pendente
- [ ] Comandos slash no input — pendente

### Fase 4: Input & Envio — ✅ **CONCLUÍDA**
- [x] Componente `MessageInput` (`app/src/ui/threads/message-input.tsx`) — textarea + Enter-to-send
- [x] Lógica de envio otimista + git commit/push assíncrono — implementado no ThreadStore/ThreadService
- [ ] Upload de anexos (UI) — pendente

### Fase 5: Sincronização & Polling — ✅ **CONCLUÍDA**
- [x] Polling com intervalo configurável — implementado no ThreadStore (`startPolling`/`stopPolling`)
- [x] `git fetch` + detecção de mudanças — implementado no ThreadService
- [x] Merge automático JSONL + fallback manual — implementado no ThreadService
- [ ] Integração com Settings (nova seção) — pendente

### Fase 6: Integração OpenCode (`/askAI`) — PENDENTE
- [ ] Cliente OpenCode (read-only)
- [ ] Handler do comando `/askAI`
- [ ] Exibição de resposta streaming (opcional)

### Fase 7: Polish & Settings — PENDENTE
- [ ] Seção Threads em Settings
- [ ] Testes de integração, acessibilidade, performance
- [ ] Virtualização de lista (`react-window`)

---

## Status Atual (2026-08-19)

### Compilação
- `npx tsc --noEmit` — **0 erros do código Threads**
- Erros restantes são todos pré-existentes (`desktop-notifications` nativo não compilado)
- `react-markdown`/`remark-gfm` **não instalados** — `react-markdown@8+` puxa `@types/react@17` que conflita com React 16 do projeto

### Arquivos Criados/Modificados
| Arquivo | Status |
|---------|--------|
| `app/src/models/thread.ts` | ✅ Criado |
| `app/src/lib/thread-service.ts` | ✅ Criado |
| `app/src/lib/stores/thread-store.ts` | ✅ Criado |
| `app/src/lib/stores/thread-store-cache.ts` | ✅ Criado |
| `app/src/lib/stores/app-store.ts` | ✅ Modificado (ensureThreadsBranch + thread methods) |
| `app/src/ui/tab-bar.tsx` | ✅ Modificado (TwoRowTabBar + type fixes) |
| `app/src/ui/repository.tsx` | ✅ Modificado (wired ThreadList + ChatView) |
| `app/src/ui/dispatcher/dispatcher.ts` | ✅ Modificado (thread methods + getThreadStore) |
| `app/src/ui/threads/thread-list.tsx` | ✅ Criado |
| `app/src/ui/threads/chat-view.tsx` | ✅ Criado |
| `app/src/ui/threads/message-input.tsx` | ✅ Criado |
| `app/src/ui/threads/create-thread-modal.tsx` | ✅ Criado |
| `app/src/ui/threads/index.ts` | ✅ Criado |
| `app/styles/ui/_threads.scss` | ✅ Criado |
| `app/styles/_ui.scss` | ✅ Modificado (import _threads) |

### Próximos Passos (quando quiser continuar)
1. Upgrade React 16 → 18+ para usar `react-markdown`
2. Adicionar menu contextual nas mensagens (editar/excluir/copiar)
3. Implementar comandos slash (`/edit`, `/delete`, `/attach`, `/reply`, `/askAI`)
4. Virtualização com `react-window` para listas grandes
5. Seção de configurações em Preferences
6. Integração OpenCode (`/askAI`)
7. Testes unitários

---

## Riscos & Mitigações

| Risco | Mitigação |
|-------|-----------|
| Conflitos no JSONL (duas mensagens no mesmo ms) | Hash SHA256 + timestamp com ms + append-only; merge = concat + dedup por hash |
| Branch `desktop-claw-threads` não existe no remote | Criar no primeiro push (`git push -u origin desktop-claw-threads`) |
| Performance com milhares de mensagens | Virtualização + paginação por dia (carregar sob demanda) |
| Polling excessivo consome recursos | Intervalo mínimo 5s; pausar quando aba não focada; `git fetch` é leve |
| Anexos grandes incham o repo | Limite de tamanho (ex: 10MB); aviso; futuro: Git LFS |

---

## Dependências Novas (Sugeridas)
- `marked` ou `markdown-it` — renderização markdown
- `react-window` ou `react-virtualized` — lista virtualizada
- `crypto` (Node built-in) — SHA256
- `date-fns` ou `dayjs` — formatação de datas (já usado no projeto?)

---

## Critérios de Aceite (Definition of Done)
- [ ] **Sidebar reorganizada em 2 linhas × 3 abas** (Changes/History/Compare | Files/Threads/Agent)
- [ ] "History" corrigido (era "Hystory") na 1ª linha
- [ ] Aba "Threads" aparece na 2ª linha da sidebar (Files | Threads | Agent)
- [ ] Navegação por teclado e ARIA funcionando nas 6 abas
- [ ] Responsivo: janela estreita → scroll horizontal nas linhas
- [ ] Criar/visualizar/editar/excluir threads funciona
- [ ] Mensagens persistem em JSONL no branch `desktop-claw-threads`
- [ ] Push/pull automático ao enviar/receber
- [ ] Polling configurável nas Settings
- [ ] `/askAI` funciona (OpenCode read-only)
- [ ] Anexos funcionam
- [ ] Sem regressões nas abas existentes
- [ ] Testes unitários > 80% cobertura nos services
- [ ] Lint + typecheck passam (`yarn lint:src && yarn build:dev`)
