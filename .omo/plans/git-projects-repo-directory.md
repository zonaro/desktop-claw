# Git Preferences: Aba "Projects" + Repo Directory

> **Status: IMPLEMENTADO** ✅ — concluído em 15/08/2026

## Goal

Adicionar uma nova aba **Projects** dentro de **Options > Git** (que hoje tem Author, Default Branch e Hooks) com um campo **Repo Directory**. Essa configuração será:

1. A pasta **default** onde o desktop-claw clona repositórios.
2. A pasta cujas **subpastas que sejam repositórios git** são **automaticamente adicionadas** aos repositórios do desktop-claw, sem adição manual.

## Locked Decisions

- **Storage**: localStorage (padrão do app para preferências, ex.: `app/src/lib/hooks/config.ts`), chave `repo-directory`. Sem migration de Dexie.
- **Scan depth**: apenas subpastas diretas (leitura literal de "subpasta"). Sem recursão — evita varrer repos aninhados/`node_modules` e mantém o startup rápido.
- **Scan triggers**: (1) no startup do app (`loadInitialState`) e (2) quando a configuração é salva nas Preferences. Sem file-watcher.
- **Bare repos**: ignorados (desktop-claw não suporta bare repos na lista, igual ao fluxo manual "Add local repository").
- **Reuso**: o scan usa `_addRepositories` existente (valida via `getRepositoryType`, deduplica via `matchExistingRepository`, refresca GitHub metadata/LFS).
- **Code style**: named exports, interfaces com prefixo I, readonly props, sem enums novos (union types).

## Steps

1. ✅ **Novo helper de preferência** — `app/src/lib/helpers/repo-directory.ts`:
   - `getRepoDirectory(): string | null` — lê `localStorage.getItem('repo-directory')`; retorna `null` se vazio.
   - `setRepoDirectory(path: string)` — grava em `localStorage.setItem('repo-directory', path)`.

2. ✅ **Nova aba "Projects" no Git preferences** — `app/src/ui/preferences/git.tsx`:
   - `<span>Projects</span>` adicionado ao `TabBar` (após Hooks) e case `index === 3` em `renderCurrentTab()` → `renderProjectsSettings()`.
   - Novas props: `repoDirectory: string`, `onRepoDirectoryChanged: (path: string) => void`, `onChooseRepoDirectory: () => Promise<string | undefined>`.
   - UI: `TextBox` + botão "Choose…" (mesmo padrão do clone dialog) + texto de descrição explicando o comportamento (pasta default de clone + auto-add de subpastas git).

3. ✅ **Wire no dialog** — `app/src/ui/preferences/preferences.tsx`:
   - Estado `repoDirectory` inicializado com `getRepoDirectory() ?? ''`.
   - Props passadas para `<Git>` (bloco `case PreferencesTab.Git`).
   - Em `onSave()`: se o valor mudou, `setRepoDirectory(...)` e dispara rescan via `dispatcher.scanRepoDirectory()` (não-bloqueante).

4. ✅ **Pasta default de clone** — `app/src/ui/lib/default-dir.ts`:
   - `getDefaultDir()` retorna `getRepoDirectory() || localStorage.getItem('last-clone-location') || Path.join(await getDocumentsPath(), 'GitHub')`.
   - Todos os tabs do clone dialog (contas + URL) defaultam para o Repo Directory quando configurado.

5. ✅ **Auto-scan no app store** — `_scanRepoDirectory()` em `app/src/lib/stores/app-store.ts`:
   - Lê o diretório configurado; skip se não configurado ou não existir (`directoryExists`).
   - `readdir(dir, { withFileTypes: true })` → filtra `isDirectory()`.
   - Para cada subpasta: `getRepositoryType(path)` (de `app/src/lib/git/rev-parse.ts`); coleta paths com `kind === 'regular'`.
   - Chama `this._addRepositories(paths, null)` (dedup + refresh já embutidos).
   - Hook em `loadInitialState()`, não-bloqueante, erros logados.

6. ✅ **Bridge no dispatcher** — `scanRepoDirectory()` em `app/src/ui/dispatcher/dispatcher.ts` (junto de `addRepositories`) → `appStore._scanRepoDirectory()`.

7. ✅ **Styles + changelog**:
   - `app/styles/ui/_preferences.scss` — bloco `.projects-component` (reusa `.row-component` e `.settings-description`).
   - `changelog.json` — entrada `[Added]` na release `3.6.4` do topo.

## Relevant Files

- `app/src/lib/helpers/repo-directory.ts` — **novo**: get/set do Repo Directory (localStorage)
- `app/src/ui/preferences/git.tsx` — nova aba + `renderProjectsSettings()`
- `app/src/ui/preferences/preferences.tsx` — estado, props, `onSave()` (persistir + rescan)
- `app/src/ui/lib/default-dir.ts` — `getDefaultDir()` com fallback para Repo Directory
- `app/src/lib/stores/app-store.ts` — `_scanRepoDirectory()` + hook em `loadInitialState()`
- `app/src/ui/dispatcher/dispatcher.ts` — `scanRepoDirectory()`
- `app/styles/ui/_preferences.scss` — estilos
- `changelog.json` — entrada de changelog
- `.omo/plans/git-projects-repo-directory.md` — este plano

## Verification

1. ✅ **ESLint** — passou nos arquivos alterados (`yarn eslint --rulesdir ./eslint-rules ...`).
2. ✅ **Prettier** — arquivos alterados formatados e compliant.
3. ✅ **TypeScript** — `tsc --noEmit -p tsconfig.json` → **0 erros**.
4. ✅ **Testes unitários** — `node script/test.mjs`: **1771 pass / 2 fail / 1 cancelled**.
   - Falhas **pré-existentes e ambientais**, em arquivos não tocados por esta feature:
     - `git/for-each-ref-test.ts` e `git/remote-test.ts` (comportamento do git em dirs `/tmp` sem repo).
     - `ui/copilot-preferences-test.tsx` (promise pendurada, SDK do Copilot).
   - `repositories-store-test.ts` → 12/12 pass ✅
5. ⏳ **Manual** (pendente de execução pelo usuário): `yarn build:dev && yarn start`:
   - Options > Git > Projects → definir um diretório com alguns repos git dentro → Save → repos aparecem na sidebar automaticamente.
   - Abrir Clone dialog → path default aponta para o Repo Directory.
   - Reiniciar o app → repos continuam auto-adicionados.

## Further Considerations

1. **Scan recursivo?** Opção A: apenas subpastas diretas (implementado, recomendado, leitura literal). Opção B: recursivo (repos aninhados mais fundo).
2. **Scan ao focar a janela?** Opção A: startup + save apenas (implementado, recomendado). Opção B: também ao ganhar foco (pega repos clonados via CLI com o app aberto).
