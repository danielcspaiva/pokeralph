# PokéRalph PRD

> Um orquestrador de loops Ralph com interface temática de Pokémon Game Boy. Transforma o desenvolvimento autônomo com Claude Code em uma experiência gamificada onde cada task é uma batalha.

**Versão:** 0.1.0  
**Status:** Draft  
**Última atualização:** Janeiro 2025

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Stack Técnica](#stack-técnica)
3. [Arquitetura](#arquitetura)
4. [Estrutura do Monorepo](#estrutura-do-monorepo)
5. [Persistência de Dados](#persistência-de-dados)
6. [Modos de Execução](#modos-de-execução)
7. [Tasks](#tasks)
8. [Configurações Padrão](#configurações-padrão)
9. [Roadmap de Versões](#roadmap-de-versões)
10. [Notas de Implementação](#notas-de-implementação)

---

## Visão Geral

PokéRalph é uma ferramenta de desenvolvimento que orquestra o Claude Code em loops autônomos (técnica Ralph). O fluxo principal é:

1. **Planning:** Usuário descreve uma ideia → Claude refina em Plan Mode → PRD gerado
2. **Breakdown:** PRD é quebrado em tasks individuais
3. **Battle:** Cada task é executada em um loop Ralph (uma "batalha")
4. **Progress:** Interface mostra progresso em tempo real via polling de arquivos

A interface v0.1 é um wireframe funcional. O tema Pokémon (pixel art, animações, sons) será adicionado na v0.4.

---

## Stack Técnica

| Componente | Tecnologia | Justificativa |
|------------|------------|---------------|
| **Runtime** | Bun | Rápido, TypeScript nativo, workspaces integrados |
| **Monorepo** | Bun workspaces | Simplicidade, sem ferramentas extras |
| **Linguagem** | TypeScript (strict) | Type safety em todo o projeto |
| **Server** | Hono | Leve, portátil (Bun/Deno/Edge), moderno |
| **Frontend** | React + Vite | SPA rápido, fácil de embutir depois |
| **State** | Zustand | Simples, sem boilerplate |
| **Linting** | Biome | Lint + format unificados, rápido |
| **Testes** | Bun test + Vitest | Bun test para core/server, Vitest para React |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                    INTERFACES (UI)                       │
├─────────────┬─────────────┬──────────────┬──────────────┤
│   Web App   │   Desktop   │    Mobile    │     CLI      │
│ React+Vite  │   Tauri v2  │ React Native │  Ink/OpenTUI │
│   (v0.1)    │   (v0.3)    │   (futuro)   │    (v0.2)    │
└──────┬──────┴──────┬──────┴──────┬───────┴──────┬───────┘
       └─────────────┴──────┬──────┴──────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────▼─────────────────────────────┐
│                  @pokeralph/server                       │
│              API REST + WebSocket (Hono)                 │
│           Roda local, todas as UIs conectam              │
└───────────────────────────┬─────────────────────────────┘
                            │ imports
┌───────────────────────────▼─────────────────────────────┐
│                   @pokeralph/core                        │
│            Lógica de negócio (100% portátil)             │
│     Types, Claude bridge, Loop controller, Services      │
└─────────────────────────────────────────────────────────┘
```

### Princípios

- **Core é puro:** Zero dependências de UI, roda em qualquer ambiente
- **Server é a ponte:** Todas as UIs se conectam via HTTP/WebSocket
- **UIs são intercambiáveis:** Web, desktop, CLI, mobile - todas usam o mesmo server
- **Polling, não streaming:** Claude escreve em arquivos, app monitora via polling

---

## Estrutura do Monorepo

```
pokeralph/
├── package.json              # Workspace root
├── bunfig.toml               # Configuração Bun
├── tsconfig.json             # TypeScript base
├── biome.json                # Linting + formatting
├── .gitignore
│
├── packages/
│   ├── core/                 # @pokeralph/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── types/        # Interfaces e tipos
│   │   │   ├── services/     # Serviços de negócio
│   │   │   ├── utils/        # Helpers puros
│   │   │   ├── orchestrator.ts
│   │   │   └── index.ts      # Exports públicos
│   │   └── tests/
│   │
│   ├── server/               # @pokeralph/server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── routes/       # Endpoints REST
│   │   │   ├── websocket/    # Handler WebSocket
│   │   │   ├── middleware/
│   │   │   └── index.ts      # Entry point
│   │   └── tests/
│   │
│   └── web/                  # @pokeralph/web
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── components/   # Componentes React
│           ├── views/        # Views principais
│           ├── hooks/        # Custom hooks
│           ├── stores/       # Zustand stores
│           ├── api/          # Cliente HTTP + WebSocket
│           ├── App.tsx
│           └── main.tsx
│
└── tests/
    └── e2e/                  # Testes end-to-end
```

---

## Persistência de Dados

Dados são persistidos no repositório do usuário, na pasta `.pokeralph/`:

```
.pokeralph/
├── config.json               # Configurações do projeto
├── prd.json                  # PRD com tasks e status
│
└── battles/                  # Histórico de batalhas
    └── {task-id}/
        ├── progress.json     # Progresso atual (polling)
        ├── history.json      # Array de iterações
        └── logs/
            ├── iteration-1.txt
            ├── iteration-2.txt
            └── ...
```

### Schemas

**config.json:**
```json
{
  "maxIterationsPerTask": 10,
  "mode": "hitl",
  "feedbackLoops": ["test", "lint", "typecheck"],
  "timeoutMinutes": 30,
  "pollingIntervalMs": 2000,
  "autoCommit": true
}
```

**prd.json:**
```json
{
  "name": "Nome do Projeto",
  "description": "Descrição",
  "createdAt": "2025-01-15T10:00:00Z",
  "tasks": [
    {
      "id": "001-task-name",
      "title": "Título da Task",
      "description": "Descrição detalhada",
      "status": "pending",
      "priority": 1,
      "acceptanceCriteria": ["Critério 1", "Critério 2"],
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T10:00:00Z"
    }
  ]
}
```

**progress.json:**
```json
{
  "taskId": "001-task-name",
  "currentIteration": 3,
  "status": "in_progress",
  "lastUpdate": "2025-01-15T10:30:00Z",
  "logs": [
    "Explorando codebase...",
    "Implementando função X...",
    "Rodando testes..."
  ]
}
```

---

## Modos de Execução

### HITL (Human in the Loop)

- Após cada iteração, aguarda aprovação do usuário
- Usuário pode revisar output, aprovar, ou cancelar
- Recomendado para tasks de alto risco e arquitetura

### YOLO Mode

- Executa automaticamente até completar ou atingir max iterations
- Detecta completion sigil: `<promise>COMPLETE</promise>`
- Recomendado para tasks de baixo risco

---

## Tasks

### Fase 1: Infraestrutura (Tasks 1-2)

#### Task 001: Setup do monorepo com Bun workspaces

**Prioridade:** 1  
**Risco:** Baixo  
**Estimativa:** 3 iterações

**Descrição:**  
Criar estrutura base do monorepo com todos os packages configurados.

**Critérios de Aceite:**
- [ ] Inicializar repo com `bun init`
- [ ] Configurar workspaces em package.json: `packages/*`
- [ ] Criar packages/core com package.json (`@pokeralph/core`)
- [ ] Criar packages/server com package.json (`@pokeralph/server`)
- [ ] Criar packages/web com package.json (`@pokeralph/web`)
- [ ] tsconfig.json base na raiz com strict mode
- [ ] Cada package extende tsconfig base
- [ ] biome.json configurado para lint + format
- [ ] Scripts na raiz: dev, build, test, lint, typecheck
- [ ] `bun run dev` roda server + web simultaneamente
- [ ] `bun run test` roda testes de todos os packages
- [ ] Verificar que imports entre packages funcionam

---

#### Task 002: Definir tipos core em @pokeralph/core

**Prioridade:** 2  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
Criar todas as interfaces TypeScript para o domínio da aplicação.

**Critérios de Aceite:**
- [ ] `src/types/prd.ts`: Interface PRD { name, description, tasks[], metadata }
- [ ] `src/types/task.ts`: Interface Task { id, title, description, status, priority, acceptanceCriteria[], iterations[], createdAt, updatedAt }
- [ ] `src/types/task.ts`: Enum TaskStatus { pending, planning, in_progress, paused, completed, failed }
- [ ] `src/types/config.ts`: Interface Config { maxIterationsPerTask, mode, feedbackLoops[], timeoutMinutes, pollingIntervalMs, autoCommit }
- [ ] `src/types/progress.ts`: Interface Progress { taskId, currentIteration, status, lastUpdate, logs[] }
- [ ] `src/types/iteration.ts`: Interface Iteration { number, startedAt, endedAt?, output, result, filesChanged[] }
- [ ] `src/types/battle.ts`: Interface Battle { taskId, status, iterations[], startedAt, completedAt? }
- [ ] `src/types/events.ts`: Types para eventos do sistema
- [ ] `src/types/index.ts`: Re-exporta todos os tipos
- [ ] Todos os tipos com JSDoc documentando cada campo
- [ ] Testes de tipo (type assertions) para validar schemas

---

### Fase 2: Core Services (Tasks 3-11)

#### Task 003: Serviço FileManager em @pokeralph/core

**Prioridade:** 3  
**Risco:** Médio  
**Estimativa:** 4 iterações

**Descrição:**  
Serviço responsável por toda I/O de arquivos na pasta .pokeralph

**Critérios de Aceite:**
- [ ] `src/services/file-manager.ts`: Classe FileManager
- [ ] constructor(basePath: string) define raiz do repo
- [ ] getPokeRalphPath() retorna caminho da pasta .pokeralph
- [ ] init() cria estrutura de pastas se não existir
- [ ] exists() verifica se .pokeralph existe
- [ ] loadConfig(): Config lê e valida config.json
- [ ] saveConfig(config: Config) escreve config.json
- [ ] loadPRD(): PRD lê e valida prd.json
- [ ] savePRD(prd: PRD) escreve prd.json
- [ ] createBattleFolder(taskId: string) cria pasta da batalha
- [ ] loadProgress(taskId: string): Progress lê progress.json
- [ ] saveProgress(taskId: string, progress: Progress) escreve progress.json
- [ ] loadBattleHistory(taskId: string): Battle lê history.json
- [ ] appendIteration(taskId: string, iteration: Iteration) adiciona ao history
- [ ] writeIterationLog(taskId: string, iterationNum: number, log: string) salva log
- [ ] Validação com Zod schemas para todas as leituras
- [ ] Tratamento de erros consistente (FileNotFoundError, ValidationError)
- [ ] Testes unitários com pasta temporária para cada teste

---

#### Task 004: Serviço PromptBuilder em @pokeralph/core

**Prioridade:** 4  
**Risco:** Médio  
**Estimativa:** 3 iterações

**Descrição:**  
Constrói prompts otimizados para o Claude Code em diferentes contextos.

**Critérios de Aceite:**
- [ ] `src/services/prompt-builder.ts`: Classe PromptBuilder
- [ ] buildPlanningPrompt(idea: string): string para iniciar plan mode
- [ ] buildTaskPrompt(task: Task, context: TaskContext): string para executar task
- [ ] TaskContext inclui: PRD resumido, progresso atual, arquivos relevantes
- [ ] Prompt de task inclui instrução para atualizar progress.json
- [ ] Prompt de task inclui formato esperado do output
- [ ] Prompt inclui completion sigil: `<promise>COMPLETE</promise>`
- [ ] Prompt inclui instrução de feedback loops a rodar
- [ ] Prompt inclui instrução de commit após sucesso
- [ ] buildBreakdownPrompt(prd: string): string para quebrar PRD em tasks
- [ ] Templates são constantes bem documentadas
- [ ] Testes verificando estrutura dos prompts gerados

---

#### Task 005: Serviço ClaudeBridge em @pokeralph/core

**Prioridade:** 5  
**Risco:** Alto  
**Estimativa:** 5 iterações

**Descrição:**  
Bridge que spawna Claude Code CLI e monitora execução via polling de arquivos.

**Critérios de Aceite:**
- [ ] `src/services/claude-bridge.ts`: Classe ClaudeBridge
- [ ] constructor(options: ClaudeBridgeOptions) com workingDir, timeout, etc
- [ ] spawnPlanMode(prompt: string): ChildProcess inicia claude em plan mode
- [ ] spawnExecutionMode(prompt: string): ChildProcess inicia com acceptEdits
- [ ] buildCommand(mode: 'plan' | 'execute', prompt: string): string[]
- [ ] Usa Bun.spawn() para criar child process
- [ ] kill() mata processo atual
- [ ] isRunning(): boolean verifica se processo está ativo
- [ ] onExit(callback) handler para quando processo termina
- [ ] Captura stdout/stderr para logs
- [ ] Timeout configurável que mata processo
- [ ] Testes com mock do Claude Code (script fake que simula comportamento)

---

#### Task 006: Serviço ProgressWatcher em @pokeralph/core

**Prioridade:** 6  
**Risco:** Médio  
**Estimativa:** 3 iterações

**Descrição:**  
Monitora arquivos de progresso via polling e emite eventos.

**Critérios de Aceite:**
- [ ] `src/services/progress-watcher.ts`: Classe ProgressWatcher extends EventEmitter
- [ ] constructor(fileManager: FileManager, intervalMs: number)
- [ ] watch(taskId: string) inicia polling do progress.json da task
- [ ] stop() para o polling
- [ ] Emite evento 'progress' quando arquivo muda
- [ ] Emite evento 'complete' quando detecta completion sigil
- [ ] Emite evento 'error' quando detecta erro no progress
- [ ] Debounce para não emitir eventos duplicados
- [ ] Compara hash do arquivo para detectar mudanças reais
- [ ] Testes com arquivos que mudam durante execução

---

#### Task 007: Serviço FeedbackRunner em @pokeralph/core

**Prioridade:** 7  
**Risco:** Médio  
**Estimativa:** 3 iterações

**Descrição:**  
Executa feedback loops (test, lint, typecheck) e reporta resultados.

**Critérios de Aceite:**
- [ ] `src/services/feedback-runner.ts`: Classe FeedbackRunner
- [ ] constructor(workingDir: string)
- [ ] detectAvailableLoops(): string[] descobre scripts no package.json
- [ ] runLoop(name: string): FeedbackResult executa um loop específico
- [ ] runAll(loops: string[]): FeedbackResult[] executa múltiplos loops
- [ ] FeedbackResult: { name, passed, output, duration }
- [ ] Suporta: test, lint, typecheck, format:check
- [ ] Timeout por loop (configurável)
- [ ] Captura stdout/stderr completo
- [ ] Detecta exit code para pass/fail
- [ ] Testes com package.json fake

---

#### Task 008: Serviço GitService em @pokeralph/core

**Prioridade:** 8  
**Risco:** Baixo  
**Estimativa:** 3 iterações

**Descrição:**  
Gerencia operações Git (commit, status, revert).

**Critérios de Aceite:**
- [ ] `src/services/git-service.ts`: Classe GitService
- [ ] constructor(workingDir: string)
- [ ] isRepo(): boolean verifica se é um repo git
- [ ] init(): void inicializa repo se não existir
- [ ] status(): GitStatus retorna arquivos modificados
- [ ] add(files: string[] | 'all') adiciona arquivos ao stage
- [ ] commit(message: string): string retorna hash do commit
- [ ] getLastCommit(): CommitInfo retorna info do último commit
- [ ] revert(): void desfaz último commit (soft reset)
- [ ] Mensagem de commit formatada: `[PokéRalph] {taskId}: {title}`
- [ ] Ignora .pokeralph/battles/ automaticamente
- [ ] Usa Bun.spawn() com comandos git
- [ ] Testes com repo temporário

---

#### Task 009: Serviço LoopController em @pokeralph/core

**Prioridade:** 9  
**Risco:** Alto  
**Estimativa:** 6 iterações

**Descrição:**  
Orquestra o loop Ralph completo para uma task.

**Critérios de Aceite:**
- [ ] `src/services/loop-controller.ts`: Classe LoopController extends EventEmitter
- [ ] constructor(dependencies: { fileManager, claudeBridge, progressWatcher, feedbackRunner, gitService, promptBuilder })
- [ ] startBattle(taskId: string, mode: 'hitl' | 'yolo'): void inicia execução
- [ ] Implementa loop: prompt → execute → poll → feedback → commit → repeat
- [ ] Respeita maxIterations da config
- [ ] Detecta completion sigil e para loop
- [ ] Detecta falhas e marca task como failed
- [ ] pause(): void pausa após iteração atual
- [ ] resume(): void retoma execução pausada
- [ ] cancel(): void cancela e marca como failed
- [ ] Em modo HITL: emite 'await_approval' e espera approve()
- [ ] approve(): void continua após HITL pause
- [ ] Emite eventos: battle_start, iteration_start, iteration_end, feedback_result, battle_complete, battle_failed, await_approval
- [ ] Persiste estado entre iterações via FileManager
- [ ] Recupera estado se reiniciado no meio
- [ ] Testes E2E com mock do Claude

---

#### Task 010: Serviço PlanService em @pokeralph/core

**Prioridade:** 10  
**Risco:** Alto  
**Estimativa:** 5 iterações

**Descrição:**  
Gerencia fase de planejamento e geração de PRD.

**Critérios de Aceite:**
- [ ] `src/services/plan-service.ts`: Classe PlanService extends EventEmitter
- [ ] constructor(dependencies: { claudeBridge, promptBuilder, fileManager })
- [ ] startPlanning(idea: string): void inicia plan mode
- [ ] Estado interno: planning, waiting_input, completed
- [ ] Emite 'output' com streaming do Claude
- [ ] Emite 'question' quando Claude faz pergunta
- [ ] answerQuestion(answer: string): void envia resposta
- [ ] finishPlanning(): PRD finaliza e extrai PRD
- [ ] breakIntoTasks(prd: PRD): Task[] quebra PRD em tasks
- [ ] Pode usar nova instância do Claude para breakdown
- [ ] savePRD(prd: PRD): void persiste via FileManager
- [ ] Testes com mock de conversas

---

#### Task 011: Classe Orchestrator principal em @pokeralph/core

**Prioridade:** 11  
**Risco:** Médio  
**Estimativa:** 4 iterações

**Descrição:**  
Fachada que unifica todos os serviços e expõe API limpa.

**Critérios de Aceite:**
- [ ] `src/orchestrator.ts`: Classe Orchestrator
- [ ] constructor(workingDir: string) inicializa todos os serviços
- [ ] init(): void inicializa .pokeralph se necessário
- [ ] getConfig(): Config retorna config atual
- [ ] updateConfig(partial: Partial<Config>): void atualiza config
- [ ] getPRD(): PRD | null retorna PRD atual
- [ ] startPlanning(idea: string): void delega para PlanService
- [ ] onPlanningOutput(callback): void
- [ ] onPlanningQuestion(callback): void
- [ ] answerPlanningQuestion(answer: string): void
- [ ] finishPlanning(): PRD
- [ ] getTasks(): Task[] retorna todas as tasks
- [ ] getTask(id: string): Task | null
- [ ] addTask(task: Omit<Task, 'id'>): Task adiciona task ao PRD
- [ ] updateTask(id: string, partial: Partial<Task>): Task
- [ ] startBattle(taskId: string): void delega para LoopController
- [ ] pauseBattle(): void
- [ ] resumeBattle(): void
- [ ] cancelBattle(): void
- [ ] approveBattle(): void para HITL
- [ ] onBattleEvent(event: string, callback): void
- [ ] getBattleProgress(taskId: string): Progress | null
- [ ] getBattleHistory(taskId: string): Battle | null
- [ ] Singleton ou factory pattern
- [ ] `src/index.ts` exporta Orchestrator e todos os tipos
- [ ] Testes de integração do fluxo completo

---

### Fase 3: Server (Tasks 12-17)

#### Task 012: Setup do servidor Hono em @pokeralph/server

**Prioridade:** 12  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
Configurar servidor HTTP com Hono e estrutura de rotas.

**Critérios de Aceite:**
- [ ] `src/index.ts`: Entry point que inicia servidor
- [ ] Usa Hono com adapter para Bun
- [ ] CORS configurado para localhost
- [ ] Middleware de logging
- [ ] Middleware de error handling
- [ ] `src/routes/index.ts`: Agrupa todas as rotas
- [ ] Porta configurável via env PORT (default 3456)
- [ ] Health check em GET /health
- [ ] Graceful shutdown
- [ ] Instancia Orchestrator do @pokeralph/core
- [ ] Testa com bun run (server) e curl

---

#### Task 013: Rotas de configuração em @pokeralph/server

**Prioridade:** 13  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
Endpoints para ler e atualizar configuração.

**Critérios de Aceite:**
- [ ] `src/routes/config.ts`: Router de config
- [ ] GET /api/config retorna config atual
- [ ] PUT /api/config atualiza config (validação com Zod)
- [ ] Retorna 400 se validação falhar
- [ ] Testes de integração

---

#### Task 014: Rotas de PRD/Tasks em @pokeralph/server

**Prioridade:** 14  
**Risco:** Baixo  
**Estimativa:** 3 iterações

**Descrição:**  
Endpoints para gerenciar PRD e tasks.

**Critérios de Aceite:**
- [ ] `src/routes/prd.ts`: Router de PRD
- [ ] GET /api/prd retorna PRD completo
- [ ] PUT /api/prd atualiza PRD inteiro
- [ ] GET /api/tasks retorna array de tasks
- [ ] GET /api/tasks/:id retorna task específica
- [ ] POST /api/tasks cria nova task
- [ ] PUT /api/tasks/:id atualiza task
- [ ] DELETE /api/tasks/:id remove task
- [ ] Validação com Zod em todos os endpoints
- [ ] Testes de integração

---

#### Task 015: Rotas de Planning em @pokeralph/server

**Prioridade:** 15  
**Risco:** Médio  
**Estimativa:** 3 iterações

**Descrição:**  
Endpoints para fase de planejamento.

**Critérios de Aceite:**
- [ ] `src/routes/planning.ts`: Router de planning
- [ ] POST /api/planning/start { idea } inicia plan mode
- [ ] POST /api/planning/answer { answer } responde pergunta
- [ ] POST /api/planning/finish finaliza e retorna PRD
- [ ] GET /api/planning/status retorna estado atual
- [ ] Retorna 409 se planning já em andamento
- [ ] Testes de integração

---

#### Task 016: Rotas de Battle em @pokeralph/server

**Prioridade:** 16  
**Risco:** Médio  
**Estimativa:** 3 iterações

**Descrição:**  
Endpoints para controlar execução de tasks.

**Critérios de Aceite:**
- [ ] `src/routes/battle.ts`: Router de battle
- [ ] POST /api/battle/start/:taskId inicia batalha
- [ ] POST /api/battle/pause pausa batalha atual
- [ ] POST /api/battle/resume retoma batalha
- [ ] POST /api/battle/cancel cancela batalha
- [ ] POST /api/battle/approve aprova iteração (HITL)
- [ ] GET /api/battle/current retorna batalha em andamento
- [ ] GET /api/battle/:taskId/progress retorna progresso
- [ ] GET /api/battle/:taskId/history retorna histórico
- [ ] Retorna 409 se batalha já em andamento
- [ ] Retorna 404 se task não existe
- [ ] Testes de integração

---

#### Task 017: WebSocket para eventos real-time

**Prioridade:** 17  
**Risco:** Médio  
**Estimativa:** 3 iterações

**Descrição:**  
WebSocket que emite eventos do Orchestrator para clientes.

**Critérios de Aceite:**
- [ ] `src/websocket/index.ts`: Setup WebSocket com Hono
- [ ] Endpoint /ws aceita conexões
- [ ] Escuta eventos do Orchestrator e reemite para clientes
- [ ] Eventos: planning_output, planning_question, battle_start, iteration_start, iteration_end, progress_update, feedback_result, battle_complete, battle_failed, await_approval
- [ ] Formato: { type: string, payload: any, timestamp: string }
- [ ] Broadcast para todos os clientes conectados
- [ ] Heartbeat/ping para detectar conexões mortas
- [ ] Testes com cliente WebSocket fake

---

### Fase 4: Frontend (Tasks 18-26)

#### Task 018: Setup do React app em @pokeralph/web

**Prioridade:** 18  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
Configurar projeto React + Vite + TypeScript.

**Critérios de Aceite:**
- [ ] Inicializar com Vite template react-ts
- [ ] Configurar path aliases (@/)
- [ ] Instalar dependências: zustand, react-router-dom
- [ ] Remover boilerplate default
- [ ] `src/main.tsx`: Entry point
- [ ] `src/App.tsx`: Router setup
- [ ] `src/index.css`: Reset CSS básico
- [ ] Proxy para API em vite.config.ts (/api → localhost:3456)
- [ ] `bun run dev` roda na porta 5173
- [ ] Build funciona sem erros

---

#### Task 019: Cliente API e WebSocket em @pokeralph/web

**Prioridade:** 19  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
Módulos para comunicação com o servidor.

**Critérios de Aceite:**
- [ ] `src/api/client.ts`: Wrapper fetch para endpoints REST
- [ ] Funções tipadas: getConfig, updateConfig, getPRD, getTasks, etc
- [ ] Tratamento de erros consistente
- [ ] `src/api/websocket.ts`: Cliente WebSocket
- [ ] connect(): void estabelece conexão
- [ ] disconnect(): void fecha conexão
- [ ] on(event, callback): void registra listener
- [ ] off(event, callback): void remove listener
- [ ] Reconexão automática se conexão cair
- [ ] Testes unitários com mocks

---

#### Task 020: State management com Zustand em @pokeralph/web

**Prioridade:** 20  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
Store global para estado da aplicação.

**Critérios de Aceite:**
- [ ] `src/stores/app-store.ts`: Store principal
- [ ] Estado: config, prd, tasks, currentBattle, planningState
- [ ] Actions: setConfig, setPRD, updateTask, setBattleProgress, etc
- [ ] Selectors: useConfig, useTasks, useCurrentBattle, etc
- [ ] Integração com WebSocket para updates automáticos
- [ ] Persist parcial em localStorage (config apenas)
- [ ] Testes do store

---

#### Task 021: Layout base e componentes de UI

**Prioridade:** 21  
**Risco:** Baixo  
**Estimativa:** 3 iterações

**Descrição:**  
Estrutura visual wireframe do app.

**Critérios de Aceite:**
- [ ] `src/components/Layout.tsx`: Layout principal com sidebar + main
- [ ] `src/components/Sidebar.tsx`: Lista de tasks com status
- [ ] `src/components/Header.tsx`: Nome do projeto, modo, config button
- [ ] `src/components/TaskCard.tsx`: Card de task na sidebar
- [ ] Indicadores visuais de status: pending (cinza), in_progress (amarelo), completed (verde), failed (vermelho)
- [ ] Estilo wireframe: bordas simples, cores neutras, sem Pokémon theme ainda
- [ ] Responsivo: sidebar colapsa em mobile
- [ ] CSS modules ou Tailwind

---

#### Task 022: View Dashboard/Home

**Prioridade:** 22  
**Risco:** Baixo  
**Estimativa:** 3 iterações

**Descrição:**  
Tela inicial com overview do projeto.

**Critérios de Aceite:**
- [ ] `src/views/Dashboard.tsx`: View principal
- [ ] Mostra: total tasks, completadas, pendentes, em progresso
- [ ] Lista de tasks com filtros (All, Pending, Completed, Failed)
- [ ] Click em task abre detalhes
- [ ] Botão 'Start Next Battle' inicia próxima task pendente
- [ ] Botão 'New Idea' vai para Planning
- [ ] Estado vazio se não tem PRD: mostra call-to-action para Planning

---

#### Task 023: View Planning Mode

**Prioridade:** 23  
**Risco:** Médio  
**Estimativa:** 4 iterações

**Descrição:**  
Interface para fase de planejamento com Claude.

**Critérios de Aceite:**
- [ ] `src/views/Planning.tsx`: View de planning
- [ ] Textarea para descrever ideia
- [ ] Botão 'Start Planning' chama API
- [ ] Área de chat mostrando output do Claude (streaming via WebSocket)
- [ ] Quando Claude faz pergunta: mostra input para responder
- [ ] Botão 'Send Answer' envia resposta
- [ ] Loading indicators durante processamento
- [ ] Preview do PRD sendo gerado
- [ ] Botão 'Finish Planning' finaliza
- [ ] Tela de review/edit do PRD antes de confirmar
- [ ] Botão 'Confirm & Start' salva PRD e vai para Dashboard

---

#### Task 024: View Battle (execução de task)

**Prioridade:** 24  
**Risco:** Médio  
**Estimativa:** 4 iterações

**Descrição:**  
Interface durante execução de uma task.

**Critérios de Aceite:**
- [ ] `src/views/Battle.tsx`: View de batalha
- [ ] Mostra task atual: título, descrição, acceptance criteria
- [ ] Barra de progresso: iteração X de Y
- [ ] Timer mostrando duração da iteração atual
- [ ] Área de logs mostrando output do Claude (streaming)
- [ ] Status dos feedback loops: ✓ test, ✓ lint, ✗ typecheck
- [ ] Botões de controle: Pause, Cancel
- [ ] Em modo HITL: botão 'Approve & Continue' aparece após cada iteração
- [ ] Animação de loading durante execução
- [ ] Mensagem de sucesso com confetti ao completar
- [ ] Mensagem de erro se falhar, com botão retry

---

#### Task 025: View History de task

**Prioridade:** 25  
**Risco:** Baixo  
**Estimativa:** 3 iterações

**Descrição:**  
Visualização do histórico de uma batalha.

**Critérios de Aceite:**
- [ ] `src/views/History.tsx`: View de histórico
- [ ] Recebe taskId como parâmetro de rota
- [ ] Timeline vertical de iterações
- [ ] Cada iteração mostra: número, duração, resultado (pass/fail)
- [ ] Expandir iteração mostra output completo
- [ ] Lista de arquivos modificados na iteração
- [ ] Link para commit se disponível
- [ ] Botão 'Retry Task' se task falhou

---

#### Task 026: Modal de configuração

**Prioridade:** 26  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
Interface para ajustar configurações.

**Critérios de Aceite:**
- [ ] `src/components/ConfigModal.tsx`: Modal de config
- [ ] Slider: maxIterationsPerTask (1-50)
- [ ] Toggle: modo HITL / YOLO
- [ ] Checkboxes: feedback loops (test, lint, typecheck, format)
- [ ] Input number: timeoutMinutes
- [ ] Input number: pollingIntervalMs
- [ ] Toggle: autoCommit
- [ ] Botão Save chama API e fecha modal
- [ ] Botão Cancel fecha sem salvar
- [ ] Validação inline dos inputs

---

### Fase 5: Finalização (Tasks 27-29)

#### Task 027: Script dev que roda tudo junto

**Prioridade:** 27  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
Comando único para desenvolvimento local.

**Critérios de Aceite:**
- [ ] Script `bun run dev` na raiz do monorepo
- [ ] Roda server em background na porta 3456
- [ ] Roda web com Vite na porta 5173
- [ ] Ambos em watch mode (hot reload)
- [ ] Ctrl+C mata ambos os processos
- [ ] Output colorido identificando cada processo
- [ ] Usa concurrently ou script Bun customizado

---

#### Task 028: Testes E2E do fluxo completo

**Prioridade:** 28  
**Risco:** Médio  
**Estimativa:** 4 iterações

**Descrição:**  
Testes que validam integração de todos os componentes.

**Critérios de Aceite:**
- [ ] Pasta `tests/e2e/` na raiz
- [ ] Teste: criar PRD via API, verificar persistência
- [ ] Teste: iniciar batalha, simular progresso, verificar eventos WebSocket
- [ ] Teste: fluxo HITL com approve manual
- [ ] Teste: fluxo YOLO até completion
- [ ] Teste: task que falha marca status corretamente
- [ ] Mock do Claude Code CLI para testes determinísticos
- [ ] Script `bun run test:e2e` roda testes
- [ ] CI pipeline executando testes em PR

---

#### Task 029: Documentação do projeto

**Prioridade:** 29  
**Risco:** Baixo  
**Estimativa:** 2 iterações

**Descrição:**  
README e docs para usuários e contribuidores.

**Critérios de Aceite:**
- [ ] README.md: Overview, features, screenshots
- [ ] README.md: Quick start (instalação, primeiro uso)
- [ ] README.md: Comandos disponíveis
- [ ] README.md: Configuração explicada
- [ ] README.md: Arquitetura (diagrama)
- [ ] CONTRIBUTING.md: Como contribuir
- [ ] CONTRIBUTING.md: Setup de desenvolvimento
- [ ] CONTRIBUTING.md: Convenções de código
- [ ] LICENSE: MIT
- [ ] docs/ARCHITECTURE.md: Detalhes técnicos

---

## Configurações Padrão

```json
{
  "maxIterationsPerTask": 10,
  "mode": "hitl",
  "feedbackLoops": ["test", "lint", "typecheck"],
  "timeoutMinutes": 30,
  "pollingIntervalMs": 2000,
  "autoCommit": true
}
```

---

## Roadmap de Versões

### v0.1.0 - Core + Web (este PRD)

- Monorepo com Bun workspaces
- @pokeralph/core com toda lógica de negócio
- @pokeralph/server com API REST + WebSocket
- @pokeralph/web com interface wireframe funcional
- Modos HITL e YOLO
- Polling de arquivos para progresso

### v0.2.0 - CLI Interface

- Comando `pokeralph init` inicializa projeto
- Comando `pokeralph plan` inicia planning no terminal
- Comando `pokeralph battle` executa task
- Comando `pokeralph status` mostra overview
- Interface TUI com Ink ou OpenTUI
- Mesma lógica do core, rendering diferente

### v0.3.0 - Desktop App (Tauri)

- App nativo para Mac/Windows/Linux
- Tauri v2 com frontend React
- Notificações nativas do sistema
- Ícone na system tray
- Auto-update

### v0.4.0 - Pokemon Theme 🎮

- Visual pixel art estilo Game Boy
- Tasks como batalhas Pokémon animadas
- HP bar = progresso da task
- Ataques = ações do Claude
- Sound effects 8-bit
- Cada PRD = um ginásio
- Badge ao completar PRD
- Pokédex de features implementadas

### v0.5.0 - Integrations

- Pull tasks de GitHub Issues
- Pull tasks de Linear
- Sync status de volta para issue tracker
- Webhook para notificações externas

---

## Notas de Implementação

1. **Este PRD foi criado para ser executado pelo próprio PokéRalph** (meta!)

2. **v0.1.0 foca em funcionalidade:** Core + server + web. Tema Pokémon é v0.4.0 para não misturar complexidade.

3. **Tasks de alto risco devem ser HITL:** Core services, Claude bridge, loop controller.

4. **Tasks de baixo risco podem ser YOLO:** Docs, polish, UI simples.

5. **Bun é o runtime único:** Workspaces, test, e execução.

6. **Hono foi escolhido por ser leve e portátil:** Funciona em Bun, Deno, edge.

7. **Arquitetura em camadas permite extensão:** CLI, desktop, mobile podem ser adicionados depois sem refatorar core.

8. **Completion sigil:** `<promise>COMPLETE</promise>` - Claude deve emitir isso quando task está completa.

---

## Referências

- [Ralph Wiggum - ghuntley.com](https://ghuntley.com/ralph/)
- [11 Tips for AI Coding with Ralph](https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum)
- [Getting Started with Ralph](https://www.aihero.dev/getting-started-with-ralph)
- [Claude Code Plan Mode](https://docs.anthropic.com/en/docs/claude-code/plan-mode)
- [Effective Harnesses for Long-Running Agents - Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
