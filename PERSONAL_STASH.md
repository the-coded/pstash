# Personal Stash - Project-Categorized File Stash System

> **Status**: Proposta para ferramenta futura  
> **Prioridade**: Medium (útil mas não urgente)  
> **Esforço**: 18-24h (MVP + v1.0)  
> **Objetivo**: Sistema de stash persistente, categorizado por projeto, sincronizado via Git

---

## 🎯 Executive Summary

**Personal Stash** (`pstash`) é uma ferramenta CLI que estende o conceito de `git stash` com:
- ✅ **Persistência remota** via repo Git privado
- ✅ **Categorização por projeto** (detecta automaticamente)
- ✅ **Organização temporal** (timestamp-based directories)
- ✅ **Metadata rica** (tags, mensagens, arquivos, tamanho)
- ✅ **Sincronização** entre múltiplas máquinas
- ✅ **Busca avançada** (por projeto, tag, data, conteúdo)

---

## 💡 Problema que Resolve

### **Cenário Atual (Sem pstash)**

```bash
# Tenho arquivos temporários que não quero commitar
# Opção 1: git stash
git stash push -m "planning docs" *.md
# ❌ Perde se fizer git reset --hard ou clonar em outra máquina
# ❌ Difícil gerenciar múltiplos stashes
# ❌ Sem categorização por projeto

# Opção 2: Repo separado por projeto
mkdir ~/stash/scena-planning
cp *.md ~/stash/scena-planning/
# ❌ Muito overhead (muitos repos)
# ❌ Sem versionamento temporal
# ❌ Difícil sincronizar

# Opção 3: Branch órfã
git checkout --orphan planning-docs
git add *.md
git commit -m "docs"
# ❌ Polui o namespace de branches
# ❌ Difícil gerenciar múltiplos stashes
# ❌ Requer push manual
```

### **Cenário Novo (Com pstash)**

```bash
# Stash arquivos do projeto atual
pstash save "planning docs" *.md
# ✅ Detecta projeto automaticamente
# ✅ Salva em personal-stash/[project-name]/2026-03-12_01-05/
# ✅ Commit e push automático (se configurado)
# ✅ Acessível de qualquer máquina

# Listar stashes
pstash list
# scena:
#   [0] 2026-03-12 01:05 - planning docs (6 files, 245KB)
#   [1] 2026-03-10 18:22 - experiments (3 files, 12KB)

# Restaurar
pstash pop 0
# ✅ Copia arquivos para pwd
# ✅ Remove do stash (ou 'apply' para manter)

# Trabalhar em outra máquina
pstash sync  # pull + push
pstash list  # vê os mesmos stashes
pstash pop 0 # restaura
```

---

## 📐 Arquitetura

### **Estrutura do Repo `personal-stash`**

```
personal-stash/  (repo Git privado)
├── .pstashrc                     # Config global
├── README.md                     # Documentação
├── .gitignore
├── scena/                        # Projeto: scena
│   ├── .project.json             # Metadata do projeto
│   ├── 2026-03-12_01-05/         # Stash timestamp
│   │   ├── .stash.json           # Metadata do stash
│   │   ├── 1_MASTER_ROADMAP.md
│   │   ├── 1.1_IMPROVE_PERFORMANCE.md
│   │   ├── 1.2_QUALITY_IMPROVEMENTS.md
│   │   ├── 1.3_ZOD_IMPROVEMENTS.md
│   │   ├── 2_PRE_LAUNCH.md
│   │   └── 3_LLM_ABSTRACTION.md
│   ├── 2026-03-15_14-30/         # Outro stash
│   │   ├── .stash.json
│   │   └── draft-features.md
│   └── 2026-03-18_09-12/
│       ├── .stash.json
│       └── temp-notes.txt
├── my-app/                       # Projeto: my-app
│   ├── .project.json
│   ├── 2026-03-10_09-15/
│   │   ├── .stash.json
│   │   └── experimental-code.ts
│   └── 2026-03-11_16-45/
│       ├── .stash.json
│       ├── config.local.json
│       └── debug.log
└── website/                      # Projeto: website
    ├── .project.json
    └── 2026-03-05_11-20/
        ├── .stash.json
        └── old-design.css
```

---

## 📄 Schemas e Metadata

### **.pstashrc** (Config Global)

```json
{
  "version": "1.0.0",
  "remote": "git@github.com:gabemule/personal-stash.git",
  "autoSync": true,
  "projects": {
    "scena": {
      "aliases": ["scena-cli", "e2e-gen"],
      "remote": "git@github.com:gabemule/scena.git",
      "path": "/Users/gab/Documents/CodePlay/e2e-gen"
    },
    "my-app": {
      "remote": "git@github.com:company/my-app.git",
      "path": "/Users/gab/projects/my-app"
    }
  },
  "defaults": {
    "keepOnPop": false,
    "autoPush": true,
    "compression": true
  }
}
```

### **.project.json** (Metadata do Projeto)

```json
{
  "name": "scena",
  "remote": "git@github.com:gabemule/scena.git",
  "aliases": ["scena-cli", "e2e-gen"],
  "stashCount": 3,
  "totalSize": "268KB",
  "createdAt": "2026-03-10T09:15:00.000Z",
  "updatedAt": "2026-03-18T09:12:30.000Z"
}
```

### **.stash.json** (Metadata do Stash)

```json
{
  "id": "2026-03-12_01-05",
  "project": "scena",
  "timestamp": "2026-03-12T01:05:32.000Z",
  "message": "planning docs",
  "tags": ["docs", "planning"],
  "branch": "main",
  "commit": "91a44bab2dbd2b6b9f748786768d36ab0715ca3b",
  "user": "gab@macmini",
  "files": [
    {
      "name": "1_MASTER_ROADMAP.md",
      "size": 45234,
      "hash": "a1b2c3d4e5f6"
    },
    {
      "name": "1.1_IMPROVE_PERFORMANCE.md",
      "size": 32156,
      "hash": "b2c3d4e5f6g7"
    },
    {
      "name": "1.2_QUALITY_IMPROVEMENTS.md",
      "size": 28945,
      "hash": "c3d4e5f6g7h8"
    },
    {
      "name": "1.3_ZOD_IMPROVEMENTS.md",
      "size": 41234,
      "hash": "d4e5f6g7h8i9"
    },
    {
      "name": "2_PRE_LAUNCH.md",
      "size": 38567,
      "hash": "e5f6g7h8i9j0"
    },
    {
      "name": "3_LLM_ABSTRACTION.md",
      "size": 63890,
      "hash": "f6g7h8i9j0k1"
    }
  ],
  "totalSize": 250026,
  "compressed": true
}
```

---

## 🛠️ CLI Commands

### **`pstash save`** - Criar Stash

```bash
# Sintaxe
pstash save [options] <message> <files...>

# Exemplos
pstash save "planning docs" *.md
pstash save -t docs -t planning "roadmap drafts" 1*.md 2*.md 3*.md
pstash save --no-push "temp work" src/experimental/*.ts

# Options
-t, --tag <tag>           Add tag (repeatable)
-p, --project <name>      Override project detection
--no-push                 Don't push to remote
--no-compress             Don't compress files
-m, --message <msg>       Alias for message (git-style)

# Output
✓ Detected project: scena
✓ Created stash: scena/2026-03-12_01-05
✓ Saved 6 files (245KB)
✓ Pushed to remote
```

### **`pstash list`** - Listar Stashes

```bash
# Sintaxe
pstash list [options]

# Exemplos
pstash list                        # Stashes do projeto atual
pstash list --all                  # Todos os projetos
pstash list --project scena        # Projeto específico
pstash list --tag docs             # Por tag
pstash list --since 7d             # Últimos 7 dias

# Options
-a, --all                 List all projects
-p, --project <name>      Filter by project
-t, --tag <tag>           Filter by tag
--since <timespec>        Since date (7d, 2w, 1m, 2026-03-01)
--until <timespec>        Until date
--json                    Output JSON

# Output
scena:
  [0] 2026-03-12 01:05 - planning docs (6 files, 245KB) [docs, planning]
  [1] 2026-03-10 18:22 - experiments (3 files, 12KB) [wip]
  [2] 2026-03-08 14:15 - draft features (1 file, 8KB)

my-app:
  [0] 2026-03-10 09:15 - experimental code (1 file, 5KB) [experiment]
```

### **`pstash show`** - Exibir Conteúdo

```bash
# Sintaxe
pstash show [options] [stash-id]

# Exemplos
pstash show                        # 🎯 Interactive: seleciona da lista
pstash show 0                      # Mostra metadata e lista arquivos
pstash show 0 --files              # Lista detalhada de arquivos
pstash show 0 --cat "*.md"         # Exibe conteúdo dos .md

# Options
-f, --files               List files with details
-c, --cat <pattern>       Cat file contents (glob pattern)
--json                    Output JSON

# Modo Interativo (sem stash-id)
? Select a stash to show: (Use arrow keys)
❯ [0] 2026-03-12 01:05 - planning docs (6 files, 245KB) [docs, planning]
  [1] 2026-03-10 18:22 - experiments (3 files, 12KB) [wip]

# Output
Stash: [project-name]/2026-03-12_01-05
Message: planning docs
Tags: docs, planning
Date: 2026-03-12 01:05:32
Branch: main
Commit: 91a44ba
Files: 6 (245KB)

Files:
  1_MASTER_ROADMAP.md (45KB)
  1.1_IMPROVE_PERFORMANCE.md (32KB)
  1.2_QUALITY_IMPROVEMENTS.md (29KB)
  1.3_ZOD_IMPROVEMENTS.md (41KB)
  2_PRE_LAUNCH.md (39KB)
  3_LLM_ABSTRACTION.md (64KB)
```

### **`pstash pop`** - Restaurar e Deletar

```bash
# Sintaxe
pstash pop [options] [stash-id]

# Exemplos
pstash pop                         # 🎯 Interactive: seleciona da lista
pstash pop 1                       # Pop stash específico (script-friendly)
pstash pop 0 --files "*.md"        # Pop apenas .md
pstash pop 0 --dest ~/temp         # Pop para pasta específica

# Options
-f, --files <pattern>     Restore only matching files
-d, --dest <path>         Destination directory (default: pwd)
--keep                    Keep stash after restore (like apply)
--force                   Overwrite existing files

# Modo Interativo (sem stash-id)
? Select a stash to pop: (Use arrow keys)
❯ [0] 2026-03-12 01:05 - planning docs (6 files, 245KB) [docs, planning]
  [1] 2026-03-10 18:22 - experiments (3 files, 12KB) [wip]
  [2] 2026-03-08 14:15 - draft features (1 file, 8KB)

# Output
✓ Restored 6 files from scena/2026-03-12_01-05
✓ Deleted stash scena/2026-03-12_01-05
```

### **`pstash apply`** - Restaurar sem Deletar

```bash
# Sintaxe
pstash apply [options] [stash-id]

# Exemplos
pstash apply                       # 🎯 Interactive: seleciona da lista
pstash apply 0                     # Apply mais recente (mantém stash)
pstash apply 1 --files "1*.md"     # Apply apenas arquivos 1*.md

# Options
Same as pop, but always keeps the stash

# Modo Interativo (sem stash-id)
? Select a stash to apply: (Use arrow keys)
❯ [0] 2026-03-12 01:05 - planning docs (6 files, 245KB) [docs, planning]
  [1] 2026-03-10 18:22 - experiments (3 files, 12KB) [wip]
```

### **`pstash drop`** - Deletar Stash

```bash
# Sintaxe
pstash drop [options] [stash-id]

# Exemplos
pstash drop                        # 🎯 Interactive: seleciona da lista
pstash drop 0                      # Deleta stash 0
pstash drop --all --project scena  # Deleta todos do projeto
pstash drop --tag temp             # Deleta por tag

# Options
-p, --project <name>      Project to delete from
-t, --tag <tag>           Delete stashes with tag
--all                     Delete all (requires confirm)
--force                   Skip confirmation

# Modo Interativo (sem stash-id)
? Select a stash to drop: (Use arrow keys)
❯ [0] 2026-03-12 01:05 - planning docs (6 files, 245KB) [docs, planning]
  [1] 2026-03-10 18:22 - experiments (3 files, 12KB) [wip]

? Are you sure you want to delete this stash? (y/N)
```

### **`pstash clean`** - Limpar Stashes Antigos

```bash
# Sintaxe
pstash clean [options]

# Exemplos
pstash clean --older-than 30d      # Deleta > 30 dias
pstash clean --keep 5              # Mantém apenas 5 mais recentes
pstash clean --tag temp            # Deleta todos com tag "temp"

# Options
--older-than <timespec>   Delete older than (30d, 2w, 1m)
--keep <n>                Keep only N most recent
-t, --tag <tag>           Delete by tag
--dry-run                 Show what would be deleted
```

### **`pstash sync`** - Sincronizar com Remote

```bash
# Sintaxe
pstash sync [options]

# Exemplos
pstash sync                        # Pull + push
pstash sync --pull                 # Pull only
pstash sync --push                 # Push only

# Options
--pull                    Pull only
--push                    Push only

# Output
✓ Pulled latest changes
✓ Pushed local changes
✓ Synced 3 stashes
```

### **`pstash diff`** - Comparar Stashes

```bash
# Sintaxe
pstash diff [stash-id-1] [stash-id-2]

# Exemplos
pstash diff                        # 🎯 Interactive: seleciona dois stashes
pstash diff 0 1                    # Diff entre stash 0 e 1
pstash diff 0 pwd                  # Diff entre stash 0 e working dir

# Modo Interativo (sem argumentos)
? Select first stash: (Use arrow keys)
❯ [0] 2026-03-12 01:05 - planning docs
  [1] 2026-03-10 18:22 - experiments

? Select second stash:
  [0] 2026-03-12 01:05 - planning docs
❯ [1] 2026-03-10 18:22 - experiments

# Output
Files only in scena/2026-03-12_01-05:
  + 3_LLM_ABSTRACTION.md

Files only in scena/2026-03-10_18-22:
  + experiments.ts

Files modified:
  M 1_MASTER_ROADMAP.md (+123 -45 lines)
```

### **`pstash init`** - Inicializar Personal Stash

```bash
# Sintaxe
pstash init [options]

# Exemplos
pstash init                                     # Interactive setup
pstash init --remote git@github.com:user/ps.git # Non-interactive

# Options
-r, --remote <url>        Git remote URL
--path <path>             Local path (default: ~/.personal-stash)

# Output
✓ Cloned personal-stash repo
✓ Created config ~/.pstashrc
✓ Ready to use!
```

### **`pstash config`** - Configuração

```bash
# Sintaxe
pstash config <key> [value]

# Exemplos
pstash config list                 # Lista configurações
pstash config autoSync true        # Habilita auto-sync
pstash config autoPush false       # Desabilita auto-push

# Keys
autoSync      Auto pull/push on save/pop
autoPush      Auto push on save
compression   Compress files
keepOnPop     Keep stash on pop (default: false)
```

---

## 🎨 Casos de Uso

### **1. Planning Docs (Scena)**

```bash
# No projeto scena
cd ~/Documents/CodePlay/e2e-gen

# Stash markdowns de planejamento
pstash save -t docs -t planning "planning docs v1" 1*.md 2*.md 3*.md

# Adiciona ao .gitignore
echo "1*.md" >> .gitignore
echo "2*.md" >> .gitignore
echo "3*.md" >> .gitignore
git commit -am "chore: ignore planning docs"

# Trabalha no código normalmente...
# Markdowns não aparecem mais no git status

# ─── Quando quiser LER os docs ─────────────────────

# Opção 1: Mostrar no terminal
pstash show 0 --cat "*.md"

# Opção 2: Restaurar temporariamente
pstash apply 0
# Lê os arquivos localmente...
# Quando terminar:
rm 1*.md 2*.md 3*.md

# ─── Quando quiser EDITAR os docs ──────────────────

pstash apply 0
# Edita os arquivos...
pstash save -t docs -t planning "planning docs v2" 1*.md 2*.md 3*.md
rm 1*.md 2*.md 3*.md

# ─── Em outra máquina ──────────────────────────────

pstash sync
pstash list
# [0] 2026-03-12 13:45 - planning docs v2 (6 files)
pstash apply 0
# Agora tem os docs atualizados!
```

### **2. Experimentos WIP**

```bash
# Testando nova feature experimental
pstash save -t wip -t experiment "new auth flow" src/auth/*.ts

# Volta para código limpo
git checkout .

# Trabalha em outra feature...

# Depois retoma experimento
pstash apply 0
```

### **3. Configs Locais**

```bash
# Salva configs de dev local (não quer no git)
pstash save -t config "dev configs" .env.local config.local.json

# Em outra máquina
pstash sync
pstash pop 0  # Restaura configs
```

### **4. Snapshots Pre-Refactor**

```bash
# Antes de grande refactor
pstash save -t snapshot "pre-refactor backup" src/**/*.ts

# Faz refactor...
# Se der ruim:
pstash apply 0  # Restaura snapshot
```

### **5. Limpeza Periódica**

```bash
# Limpa stashes antigos (automation script)
pstash clean --tag temp --older-than 7d
pstash clean --tag wip --older-than 30d
pstash clean --keep 10  # Mantém apenas 10 mais recentes por projeto
```

---

## 🧩 Stack Técnica

### **Linguagem & Runtime**

```json
{
  "runtime": "Node.js 20+",
  "language": "TypeScript 5.0+",
  "packageManager": "npm"
}
```

### **Dependencies**

```json
{
  "dependencies": {
    "commander": "latest",         // CLI framework
    "zod": "latest",               // Schema validation & type inference (SSoT)
    "chalk": "latest",             // Terminal colors
    "ora": "latest",               // Spinners
    "simple-git": "latest",        // Git operations
    "globby": "latest",            // File patterns
    "date-fns": "latest",          // Date parsing
    "pretty-bytes": "latest",      // Size formatting
    "tar": "latest",               // Compression
    "nanoid": "latest",            // IDs
    "@inquirer/prompts": "latest"  // Interactive CLI prompts
  },
  "devDependencies": {
    "@types/node": "latest",       // Node types
    "vitest": "latest",            // Testing
    "tsx": "latest",               // TS execution
    "tsup": "latest"               // Bundler
  }
}
```

### **Arquitetura de Tipos (Zod as Single Source of Truth)**

**Princípios**:
- ✅ **Zod é a ÚNICA fonte de tipos** — zero `interface` ou `type` escritos manualmente
- ✅ **Validação em toda fronteira I/O** — ler arquivo, config, CLI input, git output
- ✅ **Zero `as` casts** — tudo validado em runtime
- ✅ **Composição de schemas** — schemas reutilizáveis e compostos

**Pattern**:
```typescript
// schemas.ts - ÚNICA fonte de tipos
import { z } from "zod"

// 1. Definir schemas
export const StashFileSchema = z.object({
  name: z.string(),
  size: z.number().nonneg(),
  hash: z.string(),
})

export const StashMetadataSchema = z.object({
  id: z.string(),
  project: z.string(),
  timestamp: z.string().datetime(),
  message: z.string(),
  tags: z.array(z.string()).default([]),
  branch: z.string().optional(),
  commit: z.string().optional(),
  user: z.string().optional(),
  files: z.array(StashFileSchema),
  totalSize: z.number().nonneg(),
  compressed: z.boolean().default(false),
})

// 2. Derivar tipos - NUNCA escrever manualmente
export type StashFile = z.infer<typeof StashFileSchema>
export type StashMetadata = z.infer<typeof StashMetadataSchema>

// 3. Validar em toda fronteira I/O
async function loadStashMetadata(path: string): Promise<StashMetadata> {
  const raw = JSON.parse(await readFile(path, "utf-8"))
  return StashMetadataSchema.parse(raw)  // Valida + retorna tipado
}

// 4. CLI options também são schemas
export const SaveOptionsSchema = z.object({
  message: z.string().min(1, "Message is required"),
  files: z.array(z.string()).min(1, "At least one file pattern required"),
  tags: z.array(z.string()).default([]),
  project: z.string().optional(),
  push: z.boolean().default(true),
  compress: z.boolean().default(true),
})

export type SaveOptions = z.infer<typeof SaveOptionsSchema>
```

**Onde Zod entra**:

| Camada | Uso do Zod | Exemplo |
|--------|-----------|---------|
| **CLI Input** | Validar args/flags | `SaveOptionsSchema.parse(opts)` |
| **Config** | Validar `.pstashrc` | `GlobalConfigSchema.parse(json)` |
| **Metadata** | Validar `.stash.json` | `StashMetadataSchema.parse(data)` |
| **Project** | Validar `.project.json` | `ProjectMetadataSchema.parse(data)` |
| **Git output** | Parsear respostas git | `GitRemoteSchema.parse(output)` |
| **File operations** | Validar paths, patterns | `FilePatternSchema.parse(pattern)` |

### **Estrutura do Projeto**

```
personal-stash-cli/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── README.md
├── LICENSE
├── .npmrc
├── bin/
│   └── pstash.ts                # Entry point (#!/usr/bin/env node)
├── src/
│   ├── cli.ts                   # Commander setup
│   ├── commands/
│   │   ├── save.ts              # pstash save
│   │   ├── list.ts              # pstash list
│   │   ├── show.ts              # pstash show (interactive)
│   │   ├── pop.ts               # pstash pop (interactive)
│   │   ├── apply.ts             # pstash apply (interactive)
│   │   ├── drop.ts              # pstash drop (interactive + confirm)
│   │   ├── clean.ts             # pstash clean
│   │   ├── sync.ts              # pstash sync
│   │   ├── diff.ts              # pstash diff (interactive)
│   │   ├── init.ts              # pstash init
│   │   └── config.ts            # pstash config
│   ├── core/
│   │   ├── detector.ts          # Project detection
│   │   ├── stasher.ts           # Create/restore stash
│   │   ├── indexer.ts           # Manage metadata
│   │   ├── compressor.ts        # File compression
│   │   └── git.ts               # Git operations wrapper
│   ├── config/
│   │   ├── loader.ts            # Load .pstashrc
│   │   └── templates.ts         # Default configs
│   ├── utils/
│   │   ├── fs.ts                # File system utils
│   │   ├── time.ts              # Date/time parsing
│   │   ├── format.ts            # Output formatting
│   │   ├── prompts.ts           # Interactive prompts (@inquirer/prompts)
│   │   └── validation.ts        # Zod validation helpers
│   ├── types.ts                 # TypeScript types
│   └── schemas.ts               # Zod schemas
└── tests/
    ├── commands/
    ├── core/
    └── utils/
```

---

## 📦 Schemas (Zod)

```typescript
// src/schemas.ts

import { z } from "zod"

export const StashMetadataSchema = z.object({
  id: z.string(),
  project: z.string(),
  timestamp: z.string().datetime(),
  message: z.string(),
  tags: z.array(z.string()).default([]),
  branch: z.string().optional(),
  commit: z.string().optional(),
  user: z.string().optional(),
  files: z.array(z.object({
    name: z.string(),
    size: z.number(),
    hash: z.string(),
  })),
  totalSize: z.number(),
  compressed: z.boolean().default(false),
})

export type StashMetadata = z.infer<typeof StashMetadataSchema>

export const ProjectMetadataSchema = z.object({
  name: z.string(),
  remote: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  stashCount: z.number(),
  totalSize: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>

export const GlobalConfigSchema = z.object({
  version: z.string(),
  remote: z.string().url(),
  autoSync: z.boolean().default(true),
  projects: z.record(z.string(), z.object({
    aliases: z.array(z.string()).default([]),
    remote: z.string().optional(),
    path: z.string().optional(),
  })),
  defaults: z.object({
    keepOnPop: z.boolean().default(false),
    autoPush: z.boolean().default(true),
    compression: z.boolean().default(true),
  }),
})

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>
```

---

## 🔧 Core Implementation Examples

### **Project Detection**

```typescript
// src/core/detector.ts

import { execSync } from "node:child_process"
import { basename } from "node:path"

export class ProjectDetector {
  /**
   * Detecta projeto atual baseado em git remote ou diretório.
   */
  detect(): string {
    try {
      // Tenta git remote primeiro
      const remote = execSync("git remote get-url origin", { 
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"]
      }).trim()
      
      if (remote) {
        // Extrai nome do repo
        // git@github.com:gabemule/scena.git → scena
        // https://github.com/gabemule/scena.git → scena
        const match = remote.match(/\/([^\/]+?)(\.git)?$/)
        if (match) return match[1]
      }
    } catch (err) {
      // Não é repo git ou sem remote
    }
    
    // Fallback: nome do diretório atual
    return basename(process.cwd())
  }
  
  /**
   * Resolve aliases de projeto.
   */
  resolveAlias(name: string, config: GlobalConfig): string {
    for (const [projectName, meta] of Object.entries(config.projects)) {
      if (meta.aliases?.includes(name)) return projectName
    }
    return name
  }
}
```

### **Stash Creation**

```typescript
// src/core/stasher.ts

import { copyFile, mkdir } from "node:fs/promises"
import { join, basename } from "node:path"
import { nanoid } from "nanoid"
import { format } from "date-fns"
import { globby } from "globby"
import type { StashMetadata } from "../schemas.js"

export class Stasher {
  constructor(
    private stashRepoPath: string
  ) {}
  
  async save(options: {
    project: string
    message: string
    files: string[]
    tags?: string[]
    branch?: string
    commit?: string
  }): Promise<StashMetadata> {
    const timestamp = new Date()
    const id = format(timestamp, "yyyy-MM-dd_HH-mm")
    
    const stashDir = join(
      this.stashRepoPath,
      options.project,
      id
    )
    
    await mkdir(stashDir, { recursive: true })
    
    // Resolve file patterns
    const resolvedFiles = await globby(options.files, {
      cwd: process.cwd(),
      absolute: true,
    })
    
    // Copy files
    const fileMetadata = []
    let totalSize = 0
    
    for (const file of resolvedFiles) {
      const dest = join(stashDir, basename(file))
      await copyFile(file, dest)
      
      const stats = await stat(file)
      fileMetadata.push({
        name: basename(file),
        size: stats.size,
        hash: nanoid(12),  // Simplified hash
      })
      totalSize += stats.size
    }
    
    // Create metadata
    const metadata: StashMetadata = {
      id,
      project: options.project,
      timestamp: timestamp.toISOString(),
      message: options.message,
      tags: options.tags ?? [],
      branch: options.branch,
      commit: options.commit,
      user: `${process.env.USER}@${os.hostname()}`,
      files: fileMetadata,
      totalSize,
      compressed: false,
    }
    
    // Save metadata
    await writeFile(
      join(stashDir, ".stash.json"),
      JSON.stringify(metadata, null, 2)
    )
    
    return metadata
  }
  
  async restore(options: {
    project: string
    stashId: string
    dest: string
    files?: string[]
  }): Promise<StashMetadata> {
    const stashDir = join(
      this.stashRepoPath,
      options.project,
      options.stashId
    )
    
    // Read metadata
    const metadataPath = join(stashDir, ".stash.json")
    const metadata = StashMetadataSchema.parse(
      JSON.parse(await readFile(metadataPath, "utf-8"))
    )
    
    // Determine files to restore
    let filesToRestore = metadata.files.map(f => f.name)
    if (options.files) {
      const patterns = options.files
      filesToRestore = filesToRestore.filter(name =>
        patterns.some(p => minimatch(name, p))
      )
    }
    
    // Copy files
    for (const fileName of filesToRestore) {
      const src = join(stashDir, fileName)
      const dest = join(options.dest, fileName)
      await copyFile(src, dest)
    }
    
    return metadata
  }
}
```

---

## 🎯 Roadmap de Implementação

### **Phase 1: MVP (8-10h)**

**Objetivo**: Funcionalidade básica para resolver problema imediato

**Escopo**:
- [ ] CLI básico com Commander
- [ ] Comandos: `init`, `save`, `list`, `pop`, `apply`
- [ ] Detecção de projeto (git remote + fallback)
- [ ] Estrutura de pastas (projeto/timestamp)
- [ ] Metadata simples (.stash.json)
- [ ] Git operations (clone, commit, push, pull)
- [ ] Sem compressão, sem tags, sem busca avançada

**Estimativa**: 8-10h
- Setup projeto + CLI framework: 1h
- Project detector: 1h
- Stasher (save/restore): 3h
- Git wrapper: 1h
- List command: 1h
- Commands (init, pop, apply): 2h
- Testing básico: 1h

---

### **Phase 2: v1.0 (6-8h)**

**Objetivo**: Features essenciais para produtividade

**Escopo**:
- [ ] Tags (`-t` flag)
- [ ] Busca/filtros (`--tag`, `--since`, `--until`)
- [ ] Project metadata (.project.json)
- [ ] Auto-sync (config)
- [ ] `show` command com `--cat`
- [ ] `drop` command
- [ ] Error handling robusto
- [ ] Mensagens de output bonitas (chalk, ora)

**Estimativa**: 6-8h
- Tags system: 2h
- Filtros avançados: 2h
- Metadata enriquecida: 1h
- Auto-sync: 1h
- Commands extras (show, drop): 1h
- Polish UX: 1h

---

### **Phase 3: v1.1 (4-6h)**

**Objetivo**: Advanced features

**Escopo**:
- [ ] Compressão (tar.gz)
- [ ] Restaurar parcial (`--files` pattern)
- [ ] `clean` command (--older-than, --keep)
- [ ] `diff` command
- [ ] Config management (`pstash config`)
- [ ] Aliases de projetos
- [ ] Dry-run modes
- [ ] JSON output para scripting

**Estimativa**: 4-6h
- Compressão: 1h
- Partial restore: 1h
- Clean command: 1h
- Diff command: 1h
- Config + polish: 2h

---

### **Phase 4: Excellence (4-6h)**

**Objetivo**: Production-ready

**Escopo**:
- [ ] Testes completos (Vitest)
- [ ] CI/CD (GitHub Actions)
- [ ] npm publish
- [ ] Documentação completa
- [ ] Homebrew formula (macOS)
- [ ] Performance optimization
- [ ] Error recovery (corrupt metadata, etc)

**Estimativa**: 4-6h

---

## 📊 Comparação com Alternativas

| Feature | pstash | git stash | Repo separado | Branch órfã |
|---------|--------|-----------|---------------|-------------|
| **Persistência remota** | ✅ | ❌ | ✅ | ✅ |
| **Categorização por projeto** | ✅ | ❌ | ⚠️ (manual) | ❌ |
| **Múltiplos stashes** | ✅ | ⚠️ (difícil) | ⚠️ (manual) | ⚠️ (difícil) |
| **Tags/busca** | ✅ | ❌ | ❌ | ❌ |
| **Sincronização** | ✅ Auto | ❌ | ⚠️ Manual | ⚠️ Manual |
| **Facilidade** | 🟢 CLI simples | 🟡 Médio | 🔴 Complexo | 🔴 Complexo |
| **Overhead** | 🟢 1 repo | 🟢 Nenhum | 🔴 N repos | 🟡 N branches |

---

## 🔒 Segurança e Privacidade

### **Repo Privado**
- ✅ Repo `personal-stash` deve ser **privado** no GitHub
- ✅ Apenas você tem acesso
- ✅ Suporta SSH keys para autenticação

### **Sensitive Data**
- ⚠️ **NÃO** fazer stash de:
  - API keys
  - Passwords
  - Private keys
  - Tokens
  
- ✅ Para isso, use secrets managers:
  - 1Password CLI
  - AWS Secrets Manager
  - `.env` com `dotenv-vault`

### **Gitignore**
```gitignore
# personal-stash repo
.DS_Store
*.log
.env
.env.*
!.env.example
```

---

## 💡 Best Practices

### **1. Naming Conventions**

```bash
# Bom: Descritivo e tagged
pstash save -t docs "planning roadmap v1" *.md

# Ruim: Genérico
pstash save "stuff" *
```

### **2. Limpeza Regular**

```bash
# Cronjob mensal
0 0 1 * * pstash clean --tag temp --older-than 30d
```

### **3. Tags Consistentes**

```bash
# Use tags padrão
-t wip        # Work in progress
-t docs       # Documentation
-t config     # Configuration files
-t experiment # Experimental code
-t temp       # Temporary (auto-clean)
-t snapshot   # Pre-refactor snapshots
```

### **4. Auto-Sync**

```bash
# Habilite auto-sync para sempre ter backup
pstash config autoSync true
pstash config autoPush true
```

---

## 🚀 Quick Start Guide

### **Instalação** (Futuro)

```bash
# npm
npm install -g @gabemule/personal-stash

# yarn
yarn global add @gabemule/personal-stash

# pnpm
pnpm add -g @gabemule/personal-stash

# Homebrew (macOS)
brew install gabemule/tap/personal-stash
```

### **Setup Inicial**

```bash
# 1. Criar repo privado no GitHub
# Vai em https://github.com/new
# Nome: personal-stash
# Privado: ✅
# Cria

# 2. Inicializar pstash
pstash init --remote git@github.com:SEU-USER/personal-stash.git

# 3. Verificar config
pstash config list

# 4. Pronto! Fazer primeiro stash
cd ~/seu-projeto
pstash save "my first stash" arquivo.txt
```

### **Uso Diário**

```bash
# Stash arquivos
pstash save "message" *.md

# Ver stashes
pstash list

# Restaurar
pstash pop 0

# Sincronizar
pstash sync
```

---

## 📝 Próximos Passos

### **Para Implementar Agora**

1. **Criar repo privado no GitHub**:
   - Nome: `personal-stash`
   - Privacidade: Privado
   - Não adicionar README/license (vazio)

2. **Iniciar projeto CLI**:
   ```bash
   mkdir personal-stash-cli
   cd personal-stash-cli
   npm init -y
   npm install commander zod chalk ora simple-git globby date-fns pretty-bytes tar nanoid @inquirer/prompts
   npm install -D @types/node typescript tsx tsup vitest
   ```

3. **Seguir roadmap Phase 1 (MVP)**

### **Para Usar Agora (Manual)**

Enquanto a CLI não existe, você pode fazer manualmente:

```bash
# 1. Clonar repo
git clone git@github.com:gabemule/personal-stash.git ~/personal-stash

# 2. Criar estrutura manual
cd ~/personal-stash
mkdir -p scena/2026-03-12_01-30
cd scena/2026-03-12_01-30

# 3. Copiar arquivos
cp ~/Documents/CodePlay/e2e-gen/*.md .

# 4. Criar metadata
cat > .stash.json << 'EOF'
{
  "id": "2026-03-12_01-30",
  "project": "scena",
  "message": "planning docs",
  "timestamp": "2026-03-12T01:30:00.000Z",
  "tags": ["docs", "planning"]
}
EOF

# 5. Commit e push
cd ~/personal-stash
git add .
git commit -m "stash(scena): planning docs"
git push

# 6. No projeto scena, ignore os markdowns
cd ~/Documents/CodePlay/e2e-gen
echo "1*.md" >> .gitignore
echo "2*.md" >> .gitignore
echo "3*.md" >> .gitignore
git commit -am "chore: ignore planning docs"
```

---

**Última atualização**: 2026-03-12  
**Autor**: Proposta arquitetural para Personal Stash CLI  
**Status**: Proposta aprovada - Pronta para implementação
