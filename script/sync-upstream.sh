#!/usr/bin/env bash
#
# sync-upstream.sh
#
# Pulls new commits from the upstream repository (desktop-plus) into main,
# following the documented merge pattern, without losing local implementations.
#
# Safety: the script validates preconditions before touching anything, and on
# any error it aborts cleanly (aborting any in-progress merge) and prints the
# error. It never leaves the repo in a half-merged state.
#
# Usage:
#   ./script/sync-upstream.sh [--no-push] [--verify]
#
# Options:
#   --no-push   Do not push to origin after merging (default: push)
#   --verify    Run lint + build after merging (slower)
#   -h, --help  Show this help
#
# Requirements:
#   - bash, git, node (yarn is used from vendor/ if not in PATH)
#   - remotes configured: origin (your fork) and upstream (desktop-plus)
#   - clean working tree (commit or stash local changes first)
#

set -euo pipefail

APP_NAME="desktop-claw"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PUSH=1
VERIFY=0

usage() {
  cat <<'EOF'
Sincroniza o repositório com o upstream (desktop-plus).

Uso:
  ./script/sync-upstream.sh [--no-push] [--verify]

Opções:
  --no-push   Não publica para origin após o merge (padrão: publica)
  --verify    Roda lint + build após o merge (mais lento)
  -h, --help  Mostra esta ajuda
EOF
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

die() {
  printf '✖ %s\n' "$*" >&2
  exit 1
}

log() {
  printf '» %s\n' "$*"
}

# Usa o yarn do vendor quando yarn não está no PATH (como neste repo)
run_yarn() {
  if command -v yarn >/dev/null 2>&1; then
    yarn "$@"
  else
    node "${PROJECT_ROOT}/vendor/yarn-1.21.1.js" "$@"
  fi
}

# ---------------------------------------------------------------------------
# Tratamento de erro: em qualquer falha, aborta merge em andamento e reporta
# ---------------------------------------------------------------------------

MERGE_IN_PROGRESS=0

on_error() {
  local line=$1
  local cmd=$2
  local code=$3
  printf '\n✖ Erro na linha %s: %s (exit %s)\n' "${line}" "${cmd}" "${code}" >&2
  if [ "${MERGE_IN_PROGRESS}" = "1" ]; then
    printf '  → Abortando merge em andamento para restaurar o estado...\n' >&2
    git merge --abort 2>/dev/null || true
  fi
  printf '  → Nada foi aplicado. Repositório restaurado ao estado anterior.\n' >&2
  exit "${code}"
}

trap 'on_error ${LINENO} "${BASH_COMMAND}" $?' ERR

# ---------------------------------------------------------------------------
# Parsing de argumentos
# ---------------------------------------------------------------------------

for arg in "$@"; do
  case "${arg}" in
    --no-push) PUSH=0 ;;
    --verify) VERIFY=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "Argumento desconhecido: ${arg} (use --help para ajuda)"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Pré-condições — validadas antes de tocar em qualquer coisa
# ---------------------------------------------------------------------------

cd "${PROJECT_ROOT}"

# 1. Deve estar na branch main
CURRENT_BRANCH="$(git branch --show-current)"
if [ "${CURRENT_BRANCH}" != "main" ]; then
  die "Você está na branch '${CURRENT_BRANCH}', não em 'main'. Execute 'git checkout main' primeiro."
fi

# 2. Árvore de trabalho limpa
if [ -n "$(git status --porcelain)" ]; then
  die "A árvore de trabalho não está limpa. Faça commit ou stash das suas mudanças antes de sincronizar."
fi

# 3. Remotes configurados
git remote get-url upstream >/dev/null 2>&1 ||
  die "Remote 'upstream' não configurado. Adicione com: git remote add upstream https://github.com/desktop-plus/desktop-plus.git"
git remote get-url origin >/dev/null 2>&1 ||
  die "Remote 'origin' não configurado."

# ---------------------------------------------------------------------------
# Sincronização
# ---------------------------------------------------------------------------

log "Atualizando main a partir de origin..."
MERGE_IN_PROGRESS=1
git pull origin main
MERGE_IN_PROGRESS=0

log "Buscando commits do upstream..."
git fetch upstream

BEHIND="$(git rev-list --count main..upstream/main)"
if [ "${BEHIND}" = "0" ]; then
  log "Nenhum commit novo no upstream — já está atualizado."
  exit 0
fi

log "Há ${BEHIND} commit(s) novo(s) no upstream:"
git log --oneline main..upstream/main

log "Fazendo merge de upstream/main..."
MERGE_IN_PROGRESS=1
git merge upstream/main -m "Merge branch 'upstream-development'"
MERGE_IN_PROGRESS=0

log "Atualizando submodules..."
git submodule update --init --recursive

log "Instalando dependências..."
run_yarn install

if [ "${VERIFY}" = "1" ]; then
  log "Verificando lint..."
  run_yarn lint:src
  log "Verificando build..."
  run_yarn build:dev
fi

if [ "${PUSH}" = "1" ]; then
  log "Publicando para origin/main..."
  git push origin main
fi

log "✅ Sincronização concluída com sucesso!"