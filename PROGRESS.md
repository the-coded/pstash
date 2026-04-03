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
| Batch 2 | Schemas + Config (Zod SSoT) | ⏳ Pendente |
| Batch 3 | Core Engine | ⏳ Pendente |
| Batch 4 | CLI + Comandos Phase 1 (MVP) | ⏳ Pendente |
| Batch 5 | Phase 2 — Features Essenciais | ⏳ Pendente |
| Batch 6 | Phase 3 — Advanced Features | ⏳ Pendente |
| Batch 7 | Phase 4 — Excellence | ⏳ Pendente |

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

- [ ] 2.1 `src/schemas.ts` — GlobalConfigSchema, StashMetadataSchema, ProjectMetadataSchema, SaveOptionsSchema, + types derivados
- [ ] 2.2 `src/config/loader.ts` — load/save `~/.pstashrc` (os.homedir())
- [ ] 2.3 `src/config/templates.ts` — default config template
- [ ] 2.4 `src/utils/validation.ts` — Zod helpers (safeParseJson, etc.)
- [ ] 2.5 **COMMIT**: `feat: Zod schemas (SSoT) + config loader`

---

## Batch 3 — Core Engine

> **Objetivo**: Motor de operações (detector, git, stasher, indexer, utils).

- [ ] 3.1 `src/core/detector.ts` — ProjectDetector (simple-git remote + fallback basename, resolveAlias)
- [ ] 3.2 `src/core/git.ts` — GitManager (clone, commit, push, pull, initLineEndings via simple-git)
- [ ] 3.3 `src/core/stasher.ts` — Stasher.save() + Stasher.restore() (SHA-256 via node:crypto, nanoid suffix, globby)
- [ ] 3.4 `src/core/indexer.ts` — Indexer (ler/escrever `.project.json`: stashCount, totalSize, updatedAt)
- [ ] 3.5 `src/utils/fs.ts` — fs helpers (ensureDir, readJson, writeJson, removeFiles)
- [ ] 3.6 `src/utils/time.ts` — timespec parser ("7d", "2w", "1m", ISO date)
- [ ] 3.7 `src/utils/format.ts` — formatters (formatStashLine, formatSize com pretty-bytes, formatDate)
- [ ] 3.8 **COMMIT**: `feat: core engine — detector, git, stasher, indexer, utils`

---

## Batch 4 — CLI Framework + Comandos Phase 1 (MVP)

> **Objetivo**: CLI funcional com os 6 comandos essenciais do MVP.

- [ ] 4.1 `bin/pstash.ts` — entry point com shebang (`#!/usr/bin/env node`)
- [ ] 4.2 `src/cli.ts` — Commander program setup (version, description, error handler global)
- [ ] 4.3 `src/commands/init.ts` — `pstash init` (clone repo, line endings, criar ~/.pstashrc)
- [ ] 4.4 `src/commands/save.ts` — `pstash save` (detectar projeto, stasher.save, git commit/push)
- [ ] 4.5 `src/commands/list.ts` — `pstash list` (ler stashes do projeto atual, --all, --json)
- [ ] 4.6 `src/commands/pop.ts` — `pstash pop` (restore + delete, modo interativo sem ID)
- [ ] 4.7 `src/commands/apply.ts` — `pstash apply` (restore sem delete, modo interativo)
- [ ] 4.8 `src/commands/sync.ts` — `pstash sync` (git pull + push, --pull, --push)
- [ ] 4.9 `src/utils/prompts.ts` — selectStash() com @inquirer/prompts
- [ ] 4.10 Testar manualmente: `npx tsx bin/pstash.ts --help`
- [ ] 4.11 Build: `npm run build` → verificar `dist/`
- [ ] 4.12 **COMMIT**: `feat: CLI commands Phase 1 — init, save, list, pop, apply, sync`

---

## Batch 5 — Phase 2: Features Essenciais

> **Objetivo**: Tags, filtros, UX polish, e comandos extras de produtividade.

- [ ] 5.1 Tags (`-t, --tag`) integradas no `save` + armazenadas em `.stash.json`
- [ ] 5.2 `--rm` / `--keep` flags no `save` (remoção pós-stash)
- [ ] 5.3 Config `removeAfterSave` respeitada no `save`
- [ ] 5.4 `--tag` filter no `list`
- [ ] 5.5 `--since` / `--until` filters no `list`
- [ ] 5.6 `--project` filter no `list`
- [ ] 5.7 `--preview` no `list` (3 primeiras linhas de cada arquivo)
- [ ] 5.8 Auto-sync baseado em config (`autoSync`, `autoPush`)
- [ ] 5.9 `src/commands/show.ts` — `pstash show` (metadata + lista arquivos, `--cat`, `--files`, interativo)
- [ ] 5.10 `src/commands/drop.ts` — `pstash drop` (interativo + confirmação, `--all`, `--tag`)
- [ ] 5.11 `src/commands/status.ts` — `pstash status` (info projeto atual: stashes, last sync, remote)
- [ ] 5.12 Error handling robusto (config não encontrada, repo não clonado, arquivo não existe)
- [ ] 5.13 Output polish com chalk + ora spinners em todos os comandos
- [ ] 5.14 `.project.json` sendo criado/atualizado (indexer integrado no save/drop)
- [ ] 5.15 **COMMIT**: `feat: Phase 2 — show, drop, status, tags, filters, UX polish`

---

## Batch 6 — Phase 3: Advanced Features

> **Objetivo**: Compressão, restore parcial, clean, diff, config CLI.

- [ ] 6.1 `src/core/compressor.ts` — compress(dir) / decompress(tarball) via `tar` package
- [ ] 6.2 Integrar compressão no `save` (`--no-compress` flag, config `compression`)
- [ ] 6.3 Integrar decompressão no restore (pop/apply)
- [ ] 6.4 Restaurar parcial com micromatch (`--files "*.md"` em pop/apply)
- [ ] 6.5 `src/commands/clean.ts` — `pstash clean` (`--older-than`, `--keep`, `--tag`, `--dry-run`)
- [ ] 6.6 `src/commands/diff.ts` — `pstash diff` (dois stashes ou stash vs pwd, interativo)
- [ ] 6.7 `src/commands/config.ts` — `pstash config` (list, get, set chaves da config)
- [ ] 6.8 Aliases de projetos (resolveAlias funcionando end-to-end)
- [ ] 6.9 `--dry-run` nos comandos destrutivos (drop, clean)
- [ ] 6.10 `--json` output em todos os comandos (list, show, status)
- [ ] 6.11 `--dest` option no pop/apply (restaurar para pasta específica)
- [ ] 6.12 **COMMIT**: `feat: Phase 3 — compression, partial restore, clean, diff, config cmd`

---

## Batch 7 — Phase 4: Excellence

> **Objetivo**: Testes, documentação e production-ready.

- [ ] 7.1 `tests/core/detector.test.ts` — testes do ProjectDetector
- [ ] 7.2 `tests/core/stasher.test.ts` — testes do Stasher (save/restore)
- [ ] 7.3 `tests/core/git.test.ts` — testes do GitManager (mock simple-git)
- [ ] 7.4 `tests/core/indexer.test.ts` — testes do Indexer
- [ ] 7.5 `tests/utils/time.test.ts` — testes do timespec parser
- [ ] 7.6 `tests/utils/format.test.ts` — testes dos formatters
- [ ] 7.7 `tests/utils/validation.test.ts` — testes dos Zod helpers
- [ ] 7.8 `tests/config/loader.test.ts` — testes do config loader
- [ ] 7.9 `README.md` completo (instalação, setup, uso diário, todos os comandos)
- [ ] 7.10 `LICENSE` (MIT)
- [ ] 7.11 Build final `npm run build` + testar `dist/bin/pstash.js --help`
- [ ] 7.12 `npm pack` — verificar pacote antes de publicar
- [ ] 7.13 **COMMIT**: `feat: Phase 4 — tests, README, build verification`

---

## Pré-Requisitos Manuais

> Itens que precisam ser feitos **pelo usuário** (fora da CLI):

- [ ] PRE-1 Criar repo `my-personal-stash` no GitHub (privado, vazio)
- [ ] PRE-2 Clonar repo de dados: `git clone git@github.com:gabemule/my-personal-stash.git ~/.pstash`

---

*Última atualização: 2026-04-03*
