# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Launch dev server with hot-reload (electron-forge + vite)
npm run package    # Package for current platform
npm run make       # Build distributable installer
npm run lint       # ESLint with TypeScript rules
```

No test framework is configured. There are no automated tests.

## Architecture

Electron Forge app with three Vite build targets configured in `forge.config.ts`:

- **Main process** (`src/main/index.ts`) — Frameless BrowserWindow, system tray with IPC for window controls and timer state updates
- **Preload** (`src/main/preload.ts`) — Exposes `window.electronAPI` via contextBridge (minimize, close, togglePin, timer state)
- **Renderer** (`src/renderer/index.ts`) — Orchestrator that wires all subsystems together; entry point loaded by `index.html`

### Renderer subsystems

The renderer is vanilla TypeScript with no framework. All UI is built with DOM manipulation and Canvas 2D.

**State** (`renderer/state/`):
- `TimerState` — State machine (idle→running→paused→finished) using `performance.now()` and `requestAnimationFrame` tick loop. Custom Map-based EventEmitter (events: tick, stateChange, finished).
- `PomodoroState` — Wraps TimerState to manage work/shortBreak/longBreak cycles (4 work sessions → long break). Listens to TimerState's `finished` event.
- `HistoryStore` — localStorage persistence with FIFO eviction at 500 entries.

**Canvas** (`renderer/canvas/`):
- `HourglassRenderer` — Owns the `<canvas>`, runs the 60fps render loop, draws hourglass frame/glass/sand/highlights. Bezier-curved glass shape with specular highlights and radial glow.
- `ParticleSystem` — 200-400 sand grains with Euler integration physics. Spatial hash grid for grain-grain collisions. Wall collisions against 16 line segments per side derived from the hourglass curve. Grains release proportionally to elapsed time and settle in the bottom bulb.
- `effects.ts` — Color interpolation (cyan→amber→red based on progress), glow, screen-shake, idle breathing pulse.

**Audio** (`renderer/audio/`):
- `AlarmSynth` — Web Audio API procedural synthesis. Four presets (classic, chime, arcade, pulse) with looping playback and volume control.

**UI** (`renderer/ui/`):
- `TimerControls`, `PomodoroControls`, `HistoryPanel`, `SoundSettings` — DOM-based UI components that read from/write to the state classes.
- `theme.css` — Full dark-theme stylesheet for the entire app.

### Data flow

`renderer/index.ts` is the central wiring point. It creates all state/canvas/audio/UI instances and connects them via event listeners. Timer events drive canvas updates and UI state. The orchestrator pattern means subsystems don't import each other — they communicate through the orchestrator's event wiring.

### Key conventions

- Shared types live in `src/shared/types.ts` (TimerStatus, PomodoroPhase, AlarmPreset, snapshot interfaces)
- Path alias: `@shared/*` maps to `src/shared/*` (tsconfig)
- Window is frameless (`frame: false`); custom titlebar in `index.html` with IPC-based window controls
- All HTML structure is in `index.html` — UI classes query existing DOM elements rather than creating root containers
- TypeScript strict mode enabled; target ESNext with bundler module resolution
