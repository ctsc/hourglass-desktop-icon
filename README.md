# Hourglass Timer

Desktop productivity timer with a real-time sand particle simulation. Electron + TypeScript + Canvas 2D.

## Setup

```bash
npm install
npm start
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Dev with Vite HMR |
| `npm test` | Run unit tests (136 Vitest) |
| `npm run test:watch` | Watch mode |
| `npm run lint` | ESLint |
| `npm run package` | Package for current platform |
| `npm run make` | Build distributable installer |

## Stack

- **Electron 40** + Electron Forge + Vite 5 + TypeScript 5.5
- **Renderer:** Vanilla TS, Canvas 2D particle physics, Web Audio API
- **Testing:** Vitest + happy-dom

## Architecture

```
src/
  main/           # Electron main process + preload (IPC, tray, window mgmt)
  renderer/
    canvas/       # HourglassRenderer, ParticleSystem (spatial hash, Euler integration), effects
    state/        # TimerState (state machine), PomodoroState (cycle mgr), HistoryStore (localStorage)
    audio/        # AlarmSynth (4 procedural presets via Web Audio)
    ui/           # TimerControls, PomodoroControls, HistoryPanel, SoundSettings, theme.css
  shared/         # Type definitions (TimerSnapshot, PomodoroPhase, etc.)
```

`renderer/index.ts` is the orchestrator -- it wires all subsystems via events. Subsystems don't import each other.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Start / Pause toggle |
| `Escape` | Reset timer |
| `Ctrl+Shift+H` | Show / Hide window |

## License

MIT
