# Padrões de código

Convenções seguidas pelo código (algumas reforçadas por regras eslint custom em `eslint-rules/`).

## TypeScript

- **Named exports** sempre (sem default exports)
- **Interfaces com prefixo `I`** para tipos de dados (`IFtpDeployment`, `IRepository` onde aplicável)
- **Union types em vez de enums novos** (convenção deste fork)
- **Props e state readonly**: `public readonly foo: Foo` — enforced por `react-readonly-props-and-state`
- Tipos compartilhados entre processos vivem no layer `models/`; `ipc-shared.ts` só importa de `models/`

## React (16.8, class components)

- Componentes são classes (React 16 — não portar para hooks sem necessidade)
- Métodos de lifecycle corretos e bem formados — regra `react-proper-lifecycle-methods`
- Props de dispatcher devem estar bound (arrow functions/métodos bound) — regra `react-no-unbound-dispatcher-props`
- UI organizada **por feature**: `app/src/ui/<feature>/` com componentes, dialogs (`*-dialog.tsx`) e styles SCSS co-localizados
- Popups: registrar em `PopupType` (`app/src/models/popup.ts`) e rotear via `app.tsx`
- Classnames via pacote `classnames`

## Fluxo de estado

- Componentes **nunca** chamam stores diretamente; toda ação passa pelo dispatcher (`app/src/ui/dispatcher/dispatcher.ts`)
- Stores herdam `BaseStore` e notificam via event-kit; UI se inscreve com `subscribe()`
- Estado de repositório cacheado (`git-store-cache.ts`, `repository-state-cache.ts`) — respeitar o padrão existente antes de criar cache novo

## Git

- Comandos git novos: arquivo próprio em `app/src/lib/git/<operacao>.ts` usando o wrapper de `core.ts` (dugite)
- Nunca executar git fora de `lib/git/`
- Parsing de saída delimitada via `git-delimiter-parser.ts`

## IPC

- Canal novo entra no mapa tipado de `app/src/lib/ipc-shared.ts`
- Handler registrado com `registerIpcMainHandler` (`ipc-main.ts`), com validação de remetente (`trusted-ipc-sender`)
- Renderer chama main via proxy tipado (`ui/main-process-proxy.ts`) — não usar `ipcRenderer` cru
- Nunca aceitar canal de webContents não confiável — regra `no-loosely-typed-webcontents-ipc`

## Segurança

- Nunca `Math.random()` para criptografia/IDs sensíveis — regra `insecure-random` (usar crypto próprio)
- Senhas/credenciais: só OS keychain via `TokenStore` (keytar). Nada de DB/localStorage/logs
- Sanitizar HTML com `dompurify` (há uso de `marked`)

## Testes

- Unitários: `app/test/unit/<modulo>-test.ts` espelhando `app/src`; rodam com `node --test` + tsx (ver `.agents/workflow.md`)
- E2E: `app/test/e2e/*.e2e.ts` (Playwright)
- CI e testes usam `.test.env`; unit tests precisam de `yarn test:setup` (ou Docker)

## Repo housekeeping

- Mudanças visíveis ao usuário entram em `changelog.json` (validado por `validate-changelog`)
- **Nunca editar `version` em `app/package.json`** — vem de `env.APP_VERSION` (nota `$NOTE` no próprio arquivo)
- Prettier + ESLint obrigatórios (`yarn lint:src`); markdownlint para docs
- Styleguide completo do upstream: `docs/contributing/styleguide.md`

## Regras eslint custom (`eslint-rules/`)

`insecure-random.js`, `no-loosely-typed-webcontents-ipc.js`, `react-no-unbound-dispatcher-props.js`, `react-proper-lifecycle-methods.js`, `react-readonly-props-and-state.js`
