import { AlarmPreset, SoundPrefs } from '../../shared/types';
import { AlarmSynth } from '../audio/AlarmSynth';

const STORAGE_KEY = 'timerapp-sound-prefs';
const PRESETS: { key: AlarmPreset; label: string }[] = [
  { key: 'classic', label: 'Classic' },
  { key: 'chime', label: 'Chime' },
  { key: 'arcade', label: 'Arcade' },
  { key: 'pulse', label: 'Pulse' },
];

export class SoundSettings {
  private _panel: HTMLDivElement;
  private _synth: AlarmSynth;
  private _prefs: SoundPrefs;
  private _presetBtns: HTMLButtonElement[] = [];
  private _open = false;

  constructor(synth: AlarmSynth) {
    this._synth = synth;
    this._prefs = this._load();
    this._synth.setVolume(this._prefs.volume);

    this._panel = document.getElementById('sound-panel') as HTMLDivElement;
    this._buildUI();

    // Toggle button in bottom bar
    const soundBtn = document.getElementById('btn-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => this.toggle());
    }

    // Close button inside panel
    const closeBtn = this._panel.querySelector('.panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  get preset(): AlarmPreset { return this._prefs.preset; }

  toggle(): void {
    this._open = !this._open;
    this._panel.classList.toggle('open', this._open);
  }

  close(): void {
    this._open = false;
    this._panel.classList.remove('open');
  }

  private _buildUI(): void {
    // Tone presets
    const presetsDiv = this._panel.querySelector('.tone-presets')!;
    presetsDiv.innerHTML = '';

    PRESETS.forEach(p => {
      const btn = document.createElement('button');
      btn.textContent = p.label;
      btn.dataset.preset = p.key;
      if (p.key === this._prefs.preset) btn.classList.add('active');

      btn.addEventListener('click', () => {
        this._prefs.preset = p.key;
        this._presetBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._save();
        // Preview on click
        this._synth.preview(p.key);
      });

      presetsDiv.appendChild(btn);
      this._presetBtns.push(btn);
    });

    // Volume slider
    const slider = this._panel.querySelector('.volume-row input[type="range"]') as HTMLInputElement;
    const valDisplay = this._panel.querySelector('.volume-val') as HTMLSpanElement;

    slider.value = String(Math.round(this._prefs.volume * 100));
    valDisplay.textContent = `${Math.round(this._prefs.volume * 100)}%`;

    slider.addEventListener('input', () => {
      const vol = parseInt(slider.value) / 100;
      this._prefs.volume = vol;
      this._synth.setVolume(vol);
      valDisplay.textContent = `${Math.round(vol * 100)}%`;
      this._save();
    });
  }

  private _load(): SoundPrefs {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ok */ }
    return { preset: 'classic', volume: 0.7 };
  }

  private _save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._prefs));
  }
}
