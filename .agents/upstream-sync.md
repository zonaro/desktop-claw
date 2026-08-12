# Sincronização com o repositório original (desktop-plus)

## Contexto

- Este repo (**desktop-claw**) é um fork de **desktop-plus** (`https://github.com/desktop-plus/desktop-plus`), que por sua vez é fork do GitHub Desktop
- Remotes já configurados:

| Remote | URL | Papel |
| --- | --- | --- |
| `origin` | `https://github.com/zonaro/desktop-claw.git` | fork pessoal (branch `main`) |
| `upstream` | `https://github.com/desktop-plus/desktop-plus.git` | repo original |

- Ambos usam refspec completo (`+refs/heads/*:refs/remotes/*`), ou seja, `upstream/main` é o espelho local do main original
- **Observação importante (verificado no histórico)**: este fork publica os commits dele **diretamente no upstream** (`upstream/main` contém os commits do fork, ex. `f8b2fb76d3`, `0901cca2b1`). Na prática o fluxo é: desenvolver aqui → push para `upstream` (quando a mudança deve virar upstream) → `origin` mantém o espelho. Não há divergência permanente entre fork e upstream
- Estado típico atual: `main` == `origin/main`, e `main` está N commits atrás de `upstream/main` (o upstream avança com releases/betas; hoje a versão em dev é ex. `3.6.4-beta2`)

## Quando fazer

- Sempre que for preciso puxar commits novos do desktop-plus (releases, correções, features upstream)
- Sugestão: após cada release do upstream (beta ou stable)

## Procedimento de sync (merge — padrão histórico)

O histórico usa **merge commits** (`Merge branch 'upstream-development'`), não rebase. Siga o mesmo padrão.

```sh
# 1. Garantir working tree limpo e branch main atualizado
git status
git checkout main
git pull origin main

# 2. Buscar commits do upstream
git fetch upstream

# 3. Ver quanto estamos atrás e o que vem
git log --oneline main..upstream/main

# 4. Mergear o main do upstream na nossa main
git merge upstream/main
# (usa o editor de commit padrão para a mensagem de merge;
#  o padrão histórico é "Merge branch 'upstream-development'" — pode usar esse título)

# 5. Resolver conflitos, se houver (ver seção abaixo)

# 6. Submódulos — se .gitmodules/pointers mudaram
git submodule update --init --recursive

# 7. Dependências — se package.json/yarn.lock mudaram
yarn install

# 8. Verificar que nada quebrou
yarn lint:src
yarn test        # ou yarn test:docker
yarn build:dev

# 9. Publicar
git push origin main
```

## Conflitos típicos e como resolver

| Arquivo | Resolução |
| --- | --- |
| `app/package.json` (`version`) | **Nunca editar `version`** — manter o valor do upstream (a versão vem de `env.APP_VERSION` no build). Para o resto, aceitar upstream + reaplicar mudanças do fork se existirem |
| `yarn.lock` | Aceitar o do upstream e rodar `yarn install` para reconciliar |
| `changelog.json` | Manter as duas partes (release notes do upstream + entradas do fork), depois `yarn validate-changelog` |
| Código tocado pelo fork (`ftp*`, `opencode*`, worktree) | Reaplicar as mudanças do fork sobre o código novo do upstream — ver `.agents/fork-features.md` para o mapa das features |

Regra geral: o fork não mantém divergência estrutural grande; a maioria dos merges é limpa ou fast-forward.

## Variante com branch local (padrão histórico alternativo)

O histórico mostra merges de uma branch local chamada `upstream-development`. Se preferir:

```sh
git fetch upstream
git checkout -B upstream-development upstream/main
git checkout main
git merge upstream-development
```

(Equivalente ao procedimento principal; o nome da branch é livre.)

## Publicar mudanças no upstream

Como os commits do fork são pushados direto para o desktop-plus (o autor do fork é colaborador):

```sh
git push upstream main
```

> Cuidado: isto publica o que estiver em `main` no repositório oficial. Faça só quando a mudança realmente deve ir para upstream, e após verificar build/testes.

## Cheat sheet de verificação

```sh
git remote -v                       # remotes configurados
git fetch upstream && git status    # está atrás? ("Your branch is behind")
git rev-list --count main..upstream/main   # quantos commits atrás
git log --oneline main..upstream/main      # quais commits virão
git log --oneline upstream/main..main      # commits do fork ainda não publicados no upstream
```
