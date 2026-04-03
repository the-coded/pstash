# pstash — Development Progress

> **Prompt central**: Ver [`PERSONAL_STASH.md`](./PERSONAL_STASH.md) para spec completo e decisões arquiteturais.
>
> **Regra**: Ao completar cada item, marcar como `[x]` e commitar.
> Isso garante rastreabilidade entre sessões.

---

## Status Geral

| Batch | Descrição | Status |
|-------|-----------|--------|
| Batch 1 | Fundação (setup do projeto) | ✅ Completo |
| Batch 2 | Schemas + Config (Zod SSoT) | ✅ Completo |
| Batch 3 | Core Engine | ✅ Completo |
| Batch 4 | CLI + Comandos Phase 1 (MVP) | ✅ Completo |
| Batch 5 | Phase 2 — Features Essenciais | ✅ Completo |
| Batch 6 | Phase 3 — Advanced Features | ✅ Completo |
| Batch 7 | Phase 4 — Excellence | ✅ Completo |

---

## Batch 1 — Fundação

> **Objetivo**: Estrutura base do projeto com tooling configurado.

- [x] 1.1 `package.json` — deps (prod + dev), scripts, bin, engines, type:module
- [x] 1.2 `tsconfig.json` — strict, ESM, paths aliases
- [x] 1.3 `tsup.config.ts` — build config (ESM, externals, shebang)
- [x] 1.4 `eslint.config.ts` — ESLint v9 flat config + TypeScript + Prettier
- [x] 1.5 `.prettierrc` — Prettier config
- [x] 1.6 `.npmrc` — npm config
- [x] 1.7 `.gitignore` — node_modules, dist, .env, etc.
- [x] 1.8 `vitest.config.ts` — test config
- [x] 1.9 `npm install` — instalar todas as deps
- [x] 1.10 Verificar compilação (`tsc --noEmit`)
- [x] 1.11 **COMMIT**: `feat: project setup — TS, ESLint v9, Prettier, Vitest, tsup`

---

## Batch 2 — Schemas + Config

> **Objetivo**: Zod como Single Source of Truth para todos os tipos.

- [x] 2.1 `src/schemas.ts` — GlobalConfigSchema, StashMetadataSchema, ProjectMetadataSchema, SaveOptionsSchema, + types derivados
- [x] 2.2 `src/config/loader.ts` — load/save `~/.pstashrc` (os.homedir())
- [x] 2.3 `src/config/templates.ts` — default config template
- [x] 2.4 `src/utils/validation.ts` — Zod helpers (safeParseJson, etc.)
- [x] 2.5 **COMMIT**: `feat: Zod schemas (SSoT) + config loader`

---

## Batch 3 — Core Engine

> **Objetivo**: Motor de operações (detector, git, stasher, indexer, utils).

- [x] 3.1 `src/core/detector.ts` — ProjectDetector (simple-git remote + fallback basename, resolveAlias)
- [x] 3.2 `src/core/git.ts` — GitManager (clone, commit, push, pull, initLineEndings via simple-git)
- [x] 3.3 `src/core/stasher.ts` — Stasher.save() + Stasher.restore() (SHA-256 via node:crypto, nanoid suffix, globby)
- [x] 3.4 `src/core/indexer.ts` — Indexer (ler/escrever `.project.json`: stashCount, totalSize, updatedAt)
- [x] 3.5 `src/utils/fs.ts` — fs helpers (ensureDir, readJson, writeJson, removeFiles)
- [x] 3.6 `src/utils/time.ts` — timespec parser ("7d", "2w", "1m", ISO date)
- [x] 3.7 `src/utils/format.ts` — formatters (formatStashLine, formatSize com pretty-bytes, formatDate)
- [x] 3.8 **COMMIT**: `feat: core engine — detector, git, stasher, indexer, utils`

---

## Batch 4 — CLI Framework + Comandos Phase 1 (MVP)

> **Objetivo**: CLI funcional com os 6 comandos essenciais do MVP.

- [x] 4.1 `bin/pstash.ts` — entry point com shebang (`#!/usr/bin/env node`)
- [x] 4.2 `src/cli.ts` — Commander program setup (version, description, error handler global)
- [x] 4.3 `src/commands/init.ts` — `pstash init` (clone repo, line endings, criar ~/.pstashrc)
- [x] 4.4 `src/commands/save.ts` — `pstash save` (detectar projeto, stasher.save, git commit/push)
- [x] 4.5 `src/commands/list.ts` — `pstash list` (ler stashes do projeto atual, --all, --json)
- [x] 4.6 `src/commands/pop.ts` — `pstash pop` (restore + delete, modo interativo sem ID)
- [x] 4.7 `src/commands/apply.ts` — `pstash apply` (restore sem delete, modo interativo)
- [x] 4.8 `src/commands/sync.ts` — `pstash sync` (git pull + push, --pull, --push)
- [x] 4.9 `src/utils/prompts.ts` — selectStash() com @inquirer/prompts
- [x] 4.10 Testar manualmente: `npx tsx bin/pstash.ts --help` ✅
- [x] 4.11 Build: `npm run build` → ESM + DTS ✅
- [x] 4.12 **COMMIT**: `feat: CLI commands Phase 1 — init, save, list, pop, apply, sync`

---

## Batch 5 — Phase 2: Features Essenciais

> **Objetivo**: Tags, filtros, UX polish, e comandos extras de produtividade.

- [x] 5.1 Tags (`-t, --tag`) integradas no `save` + armazenadas em `.stash.json`
- [x] 5.2 `--rm` / `--keep` flags no `save` (remoção pós-stash)
- [x] 5.3 Config `removeAfterSave` respeitada no `save`
- [x] 5.4 `--tag` filter no `list`
- [x] 5.5 `--since` / `--until` filters no `list`
- [x] 5.6 `--project` filter no `list`
- [x] 5.7 `--preview` no `list` (3 primeiras linhas de cada arquivo)
- [x] 5.8 Auto-sync baseado em config (`autoSync`, `autoPush`)
- [x] 5.9 `src/commands/show.ts` — `pstash show` (metadata + lista arquivos, `--cat`, `--files`, interativo)
- [x] 5.10 `src/commands/drop.ts` — `pstash drop` (interativo + confirmação, `--all`, `--tag`)
- [x] 5.11 `src/commands/status.ts` — `pstash status` (info projeto atual: stashes, last sync, remote)
- [x] 5.12 Error handling robusto (config não encontrada, repo não clonado, arquivo não existe)
- [x] 5.13 Output polish com chalk + ora spinners em todos os comandos
- [x] 5.14 `.project.json` sendo criado/atualizado (indexer integrado no save/drop)
- [x] 5.15 **COMMIT**: `feat: Phase 2 — show, drop, status, tags, filters, UX polish`

---

## Batch 6 — Phase 3: Advanced Features

> **Objetivo**: Compressão, restore parcial, clean, diff, config CLI.

- [x] 6.1 `src/core/compressor.ts` — compress(dir) / decompress(tarball) via `tar` package
- [x] 6.2 Integrar compressão no `save` (`--no-compress` flag, config `compression`)
- [x] 6.3 Integrar decompressão no restore (pop/apply) — `Stasher.restoreCompressed()` com temp dir para filtros
- [x] 6.4 Restaurar parcial com micromatch (`--files "*.md"` em pop/apply) — suporte comprimido e não-comprimido
- [x] 6.5 `src/commands/clean.ts` — `pstash clean` (`--older-than`, `--keep`, `--tag`, `--dry-run`, `--all`)
- [x] 6.6 `src/commands/diff.ts` — `pstash diff` (LCS diff built-in, dois stashes ou stash vs pwd, interativo)
- [x] 6.7 `src/commands/config.ts` — `pstash config` (list, get, set com dot-notation)
- [x] 6.8 Aliases de projetos (resolveAlias já implementado no Batch 3 via detector.ts)
- [x] 6.9 `--dry-run` nos comandos destrutivos (drop, clean)
- [x] 6.10 `--json` output em todos os comandos (list, show, status, config, diff)
- [x] 6.11 `--dest` option no pop/apply (já implementado no Batch 4)
- [x] 6.12 **COMMIT**: `feat: Phase 3 — compression, partial restore, clean, diff, config cmd`

---

## Batch 7 — Phase 4: Excellence

> **Objetivo**: Testes, documentação e production-ready.

- [x] 7.1 `tests/core/detector.test.ts` — testes do ProjectDetector (18 testes)
- [x] 7.2 `tests/core/stasher.test.ts` — testes do Stasher (save/restore) (15 testes)
- [x] 7.3 `tests/core/git.test.ts` — testes do GitManager (mock simple-git) (19 testes)
- [x] 7.4 `tests/core/indexer.test.ts` — testes do Indexer (12 testes)
- [x] 7.5 `tests/utils/time.test.ts` — testes do timespec parser (25 testes)
- [x] 7.6 `tests/utils/format.test.ts` — testes dos formatters (25 testes)
- [x] 7.7 `tests/utils/validation.test.ts` — testes dos Zod helpers (20 testes)
- [x] 7.8 `tests/config/loader.test.ts` — testes do config loader (13 testes)
- [x] 7.9 `README.md` completo (instalação, setup, uso diário, todos os comandos)
- [x] 7.10 `LICENSE` (MIT)
- [x] 7.11 Build final `npm run build` + testar `dist/bin/pstash.js --help` ✅
- [x] 7.12 `npm pack` — 9 arquivos, 73.3 KB ✅
- [x] 7.13 **COMMIT**: `feat: Phase 4 — tests, README, build verification`

---

## Pré-Requisitos Manuais

> Itens que precisam ser feitos **pelo usuário** (fora da CLI):

- [ ] PRE-1 Criar repo `my-personal-stash` no GitHub (privado, vazio)
- [ ] PRE-2 Clonar repo de dados: `git clone git@github.com:gabemule/my-personal-stash.git ~/.pstash`

---

*Última atualização: 2026-04-03 — Batch 7 concluído · 147 testes · 8 arquivos de teste · production-ready*
