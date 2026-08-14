# agents.md — Índice da documentação técnica

Este repositório é o **desktop-claw**, um fork de [desktop-plus](https://github.com/desktop-plus/desktop-plus) (que por sua vez é fork do GitHub Desktop) — um cliente Git desktop em Electron.

Toda a documentação técnica consultável vive em [`.agents/`](.agents/). Este arquivo é o sumário: leia-o primeiro para saber onde está cada informação.

## Documentos

| Documento | Conteúdo |
| --- | --- |
| [.agents/stack.md](.agents/stack.md) | Linguagens, frameworks, versões e toolchain (Node, Electron, React, Webpack, dugite, Dexie...) |
| [.agents/architecture.md](.agents/architecture.md) | Arquitetura: processos Electron, bundles webpack, fluxo de dados (dispatcher → stores → git/API/DB), camada git, Dexie, IPC |
| [.agents/code-patterns.md](.agents/code-patterns.md) | Padrões de código e convenções (named exports, interfaces `I`-prefix, readonly, regras eslint custom, estrutura de UI) |
| [.agents/workflow.md](.agents/workflow.md) | Comandos de dev/build/teste/lint e fluxos de trabalho do dia a dia |
| [.agents/known-problems.md](.agents/known-problems.md) | Problemas conhecidos, gotchas e armadilhas já encontradas |
| [.agents/fork-features.md](.agents/fork-features.md) | Features exclusivas deste fork: FTP Deployments e OpenCode (mapa de arquivos, IPC, integração, pendências) |
| [.agents/upstream-sync.md](.agents/upstream-sync.md) | Como sincronizar com o repositório original desktop-plus (puxar commits novos) |

## Regras de ouro (resumo)

1. **Node 24.15.0** é obrigatório (`.nvmrc`/`.node-version`/`.tool-versions`).
2. **Yarn clássico 1.x** via `yarn-path` (`.yarnrc` aponta para `vendor/yarn-1.21.1.js`). Não use npm/yarn moderno.
3. **Nunca edite o campo `version` em `app/package.json`** — causa merge conflicts com o upstream e é ignorado no build. A versão real é carimbada a partir da data/hora UTC da compilação, no formato `{YY}.{diaDoAno}.{HHMM}` (ex.: `26.225.1942`), definido em [`script/calendar-version.ts`](script/calendar-version.ts). `env.APP_VERSION` sobrescreve, e é assim que o CI usa uma única versão em todas as plataformas.
4. **Mudanças em código do main process exigem rebuild** (`yarn build:dev`); mudanças de renderer só precisam de reload (`Ctrl+Alt+R`).
5. **Erro `Invalid header: Does not start with Cr24` no start é normal** — ignorar.
6. **Credenciais nunca vão para Dexie/localStorage/logs** — sempre OS keychain via `TokenStore` (keytar).
7. Para puxar commits novos do desktop-plus, siga [.agents/upstream-sync.md](.agents/upstream-sync.md).
8. **A distribuição é só GitHub Releases** — nada de Winget, Homebrew, APT, DNF, AUR ou Flathub, e não existe auto-update. Push na `main` (ou workflow_dispatch) compila e publica; veja [docs/documentation/process/releases.md](docs/documentation/process/releases.md).

## Atalhos rápidos

```sh
yarn            # instalar deps (corepack enable antes se necessário)
yarn build:dev  # build de desenvolvimento
yarn start      # rodar app com watch
yarn test       # testes unitários (node --test + tsx)
yarn test:docker# testes unitários isolados em Docker (recomendado)
yarn lint:src   # eslint + prettier
yarn version:calendar  # imprime a versão que um build feito agora receberia
```

## Manutenção desta documentação

- Ao descobrir um problema novo ou uma armadilha, registre em `known-problems.md`.
- Ao mexer em feature do fork, atualize `fork-features.md`.
- Ao mudar a stack/versões, atualize `stack.md`.
- O histórico de trabalho fica em `.omo/` (plans/notepads) — não apague.
