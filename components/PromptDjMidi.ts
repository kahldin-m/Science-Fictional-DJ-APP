/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import './MixerPanel';
import './VisualizerPanel';
import './FluxPanel';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';

const PRESETS = {
  'Sci-fi Story': {
    'Celestial Choir Pads': 0.74, // 37%
    'Pulsing Sub Bass': 0.98, // 49%
    'Glimmering Synth Arpeggios': 0.90, // 45%
    'Glitchy, Staccato Beat': 0.16, // 8%
    '80s Retro Synthwave': 1.2, // 60%
  },
  'Space Station': {
    'Analog Synth Lead': 1.46, // 73%
    'Ominous Strings': 0.5, // 25%
    'Cinematic Brass': 0.16, // 8%
    'Dystopian Industrial': 0.56, // 28%
    'Pulsing Sub Bass': 0.36, // 18%
  },
  'Cosmic Anomaly': {
    'Deep Space Drone': 1.92, // 96%
    'Alien Vocal Samples': 0.12, // 6%
    'Cybernetic Rhythms': 0.76, // 38%
    'Laser Blasts': 0.12, // 6%
    'Ominous Strings': 0.94, // 47%
  },
};


/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  // Fix: removed `override` modifier which was causing compilation errors.
  static styles = css`
    :host {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
      position: relative;
    }
    #main-layout {
      display: flex;
      flex-direction: row;
      width: 100%;
      flex-grow: 1;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    #left-panels {
      display: flex;
      flex-direction: column;
      width: 30vmin;
      height: 80vmin;
      gap: 1vmin;
      flex-shrink: 0;
    }
    visualizer-panel {
      height: 80vmin;
      flex-shrink: 0;
    }
    .panel-placeholder {
        width: 30vmin;
        flex-shrink: 0;
    }
    #grid-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex-grow: 1;
      height: 100%;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #111;
    }
    #grid {
      width: 80vmin;
      height: 80vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 2.5vmin;
    }
    prompt-controller {
      width: 100%;
    }
    play-pause-button {
      position: relative;
      width: 15vmin;
      margin-top: -3vmin;
    }
    #top-bar {
      width: 100%;
      box-sizing: border-box;
      padding: 1vmin;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      z-index: 10;
    }
    #dimming-bar-container {
      flex: 1;
      display: flex;
      justify-content: center;
      padding-top: 1vmin;
    }
    #master-volume {
      width: 30vmin;
      cursor: pointer;
    }
    #midi-controls {
      flex: 1;
      display: flex;
      gap: 5px;
      align-items: center;
    }
    #presets {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 5px;
    }
    #stock-presets,
    #custom-presets,
    #preset-actions {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #0002;
      -webkit-font-smoothing: antialiased;
      border: 1.5px solid #fff;
      border-radius: 4px;
      user-select: none;
      padding: 3px 6px;
      &.active {
        background-color: #fff;
        color: #000;
      }
      &[disabled] {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
    select {
      font: inherit;
      padding: 5px;
      background: #fff;
      color: #000;
      border-radius: 4px;
      border: none;
      outline: none;
      cursor: pointer;
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;

  @state() private showMidi = false;
  @state() private fluxPanelVisible = false;
  @state() private fadeEnabled = false;
  @state() private masterVolume = 0.75;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;
  @state() private activePreset: string | null = null;
  @state() private activeCustomPreset: string | null = null;
  @state() private customPresets: Record<string, Record<string, number>> = {
    'Custom1': {},
    'Custom2': {},
    'Custom3': {},
  };
  @state() private mixerPromptIds = new Set<string>();

  // Flux state
  @state() private fluxActive = false;
  @state() private fluxPrompts = new Set<string>();
  @state() private fluxAmountMin = 15;
  @state() private fluxAmountMax = 30;
  @state() private fluxChance = 50;
  @state() private fluxInterval = 35;
  private fluxIntervalId: number | null = null;
  @state() private fluxCountdown = 35;
  private fluxCountdownIntervalId: number | null = null;


  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  constructor(
    initialPrompts: Map<string, Prompt>,
  ) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = new MidiDispatcher();
    this.fluxCountdown = this.fluxInterval;
  }

  // Fix: removed `override` modifier which was causing compilation errors.
  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopFluxTimer();
    this.stopFluxCountdown();
  }

  // Fix: removed `override` modifier which was causing compilation errors.
  firstUpdated() {
    this.dispatchEvent(new CustomEvent('master-volume-changed', { detail: this.masterVolume }));
  }

  private get activePromptsList(): Prompt[] {
    return [...this.prompts.values()].filter(p => p.weight > 0);
  }

  private get isMasterMixerActive(): boolean {
    const activePrompts = this.activePromptsList;
    if (activePrompts.length === 0) {
      return false;
    }
    return activePrompts.every(p => this.mixerPromptIds.has(p.promptId));
  }

  private toggleMasterMixer() {
    if (this.isMasterMixerActive) {
      // If all active are in mixer, clear mixer.
      this.mixerPromptIds = new Set();
    } else {
      // Otherwise, add all active prompts to the mixer.
      const activePromptIds = this.activePromptsList.map(p => p.promptId);
      if (activePromptIds.length > 10) {
        this.dispatchEvent(new CustomEvent('error', { detail: 'More than 10 active prompts. Adding first 10 to mixer.' }));
        this.mixerPromptIds = new Set(activePromptIds.slice(0, 10));
      } else {
        this.mixerPromptIds = new Set(activePromptIds);
      }
    }
    this.requestUpdate();
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const updatedPromptData = e.detail;
    const { promptId } = updatedPromptData;
    const oldPrompt = this.prompts.get(promptId);

    if (!oldPrompt) {
      console.error('prompt not found', promptId);
      return;
    }

    // Create a new object to ensure Lit detects the change.
    const updatedPrompt = { ...oldPrompt, ...updatedPromptData };

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, updatedPrompt);

    this.prompts = newPrompts;

    // Any manual change deselects a stock preset.
    if (this.activePreset) {
      this.activePreset = null;
    }
    
    // Changing a controller value should not deselect a custom preset.
    // This allows the user to edit and then save.
    if (this.activeCustomPreset && !Object.keys(this.customPresets).includes(this.activeCustomPreset)) {
        this.activeCustomPreset = null;
    }


    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.activePromptsList }),
    );
  }

  private handlePromptSelected(e: CustomEvent<{promptId: string}>) {
    const { promptId } = e.detail;
    const newSet = new Set(this.mixerPromptIds);
    if (newSet.has(promptId)) {
      newSet.delete(promptId);
    } else {
      if (newSet.size >= 10) {
        this.dispatchEvent(new CustomEvent('error', { detail: 'Mixer can only hold up to 10 prompts.' }));
        return;
      }
      newSet.add(promptId);
    }
    this.mixerPromptIds = newSet;
  }

  private getMixerPrompts(): Prompt[] {
    return Array.from(this.mixerPromptIds)
      .map(id => this.prompts.get(id))
      .filter((p): p is Prompt => p !== undefined);
  }

  /** Generates radial gradients for each prompt based on weight and color. */
  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.6;

      const bg: string[] = [];

      [...this.prompts.values()].forEach((p, i) => {
        const alphaPct = clamp01(p.weight / MAX_WEIGHT) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff)
          .toString(16)
          .padStart(2, '0');

        const stop = p.weight / 2;
        const x = (i % 4) / 3;
        const y = Math.floor(i / 4) / 3;
        const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30, // don't re-render more than once every XXms
  );

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  private toggleFluxPanel() {
    this.fluxPanelVisible = !this.fluxPanelVisible;
  }

  private toggleFade() {
    this.fadeEnabled = !this.fadeEnabled;
    this.dispatchEvent(new CustomEvent('fade-toggled', { detail: this.fadeEnabled }));
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e: any) {
      this.showMidi = false;
      this.dispatchEvent(new CustomEvent('error', { detail: e.message }));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private playPause() {
    this.dispatchEvent(new CustomEvent('play-pause', { detail: this.activePromptsList }));
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  private applyPreset(presetName: keyof typeof PRESETS) {
    this.activePreset = presetName;
    this.activeCustomPreset = null;
    
    const preset = PRESETS[presetName];
    const newPrompts = new Map(this.prompts);
    const newMixerIds = new Set<string>();

    // Reset all weights
    for (const prompt of newPrompts.values()) {
      prompt.weight = 0;
    }

    // Set preset weights and populate mixer IDs
    for (const prompt of newPrompts.values()) {
      const presetWeight = preset[prompt.text as keyof typeof preset];
      if (presetWeight !== undefined) {
        prompt.weight = presetWeight;
        newMixerIds.add(prompt.promptId);
      }
    }

    this.prompts = newPrompts;
    this.mixerPromptIds = newMixerIds;
    this.requestUpdate();

    // Dispatch the change
    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.activePromptsList }),
    );
  }

  private applyCustomPreset(presetName: string) {
    const hasActiveMix = this.activePromptsList.length > 0;
    const isSlotEmpty = Object.keys(this.customPresets[presetName]).length === 0;

    // Re-clicking the same active preset to revert any temporary changes.
    if (this.activeCustomPreset === presetName) {
      this.loadCustomPreset(presetName);
      return;
    }
    
    // User has an active mix and clicks a new, EMPTY preset slot.
    // --> Auto-save the current mix into that slot without loading anything.
    if (hasActiveMix && isSlotEmpty) {
        this.activePreset = null; // deselect stock presets
        this.activeCustomPreset = presetName; // select the new slot
        this.savePreset(presetName); // save the current mix
        this.dispatchEvent(new CustomEvent('error', { detail: `Your mix was saved to ${presetName}.` }));
        this.requestUpdate(); // update UI to show new active button
        return; // Exit without changing/loading prompts
    }

    // All other scenarios (clicking a non-empty slot, or an empty slot without a mix).
    // --> Load the preset from the slot.
    this.loadCustomPreset(presetName);
  }

  private loadCustomPreset(presetName: string) {
    this.activeCustomPreset = presetName;
    this.activePreset = null;
    this.mixerPromptIds = new Set<string>();
    const preset = this.customPresets[presetName];
    const newPrompts = new Map(this.prompts);

    // Reset all weights
    for (const prompt of newPrompts.values()) {
      prompt.weight = 0;
    }

    // Set preset weights from the loaded preset
    if (preset) {
        for (const prompt of newPrompts.values()) {
            if (preset[prompt.text] !== undefined) {
                prompt.weight = preset[prompt.text];
            }
        }
    }

    this.prompts = newPrompts;
    this.requestUpdate();

    this.dispatchEvent(
        new CustomEvent('prompts-changed', { detail: this.activePromptsList }),
    );
  }

  private savePreset(presetName: string) {
    const newPreset: Record<string, number> = {};
    for (const prompt of this.prompts.values()) {
      if (prompt.weight > 0) {
        newPreset[prompt.text] = prompt.weight;
      }
    }
    this.customPresets[presetName] = newPreset;
    this.requestUpdate(); // Trigger re-render to show asterisk
  }

  private handleSaveClick() {
    if (!this.activeCustomPreset) {
      this.dispatchEvent(new CustomEvent('error', { detail: 'Select a custom preset slot to save to.' }));
      return;
    }
    this.savePreset(this.activeCustomPreset);
    this.dispatchEvent(new CustomEvent('error', { detail: `Preset '${this.activeCustomPreset}' saved!` }));
    this.requestUpdate();
  }


  private clearControllers() {
    const newPrompts = new Map(this.prompts);
    for (const prompt of newPrompts.values()) {
      prompt.weight = 0;
    }

    this.prompts = newPrompts;
    this.activePreset = null;
    this.activeCustomPreset = null;
    this.mixerPromptIds = new Set<string>(); // Clear mixer selections
    this.requestUpdate();

    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.activePromptsList }),
    );
  }

  private randomizeControllers() {
    const CATEGORIES = {
      LEAD: ['Analog Synth Lead', 'Utopian Melody', 'Glimmering Synth Arpeggios', '80s Retro Synthwave'],
      PADS: ['Celestial Choir Pads', 'Ominous Strings', 'Deep Space Drone', 'Cinematic Brass'],
      PERCUSSION: ['Glitchy, Staccato Beat', 'Cybernetic Rhythms', 'Robotic Percussion', 'Dystopian Industrial'],
      BASS: ['Pulsing Sub Bass', 'Warp Drive Hum'],
    };

    const newPrompts = new Map(this.prompts);
    const newMixerPromptIds = new Set<string>();

    // 1. Clear all current controller settings.
    for (const prompt of newPrompts.values()) {
      prompt.weight = 0;
    }

    // 2. Select one random prompt from each category.
    const promptsByCategory: Record<string, Prompt[]> = {
        LEAD: [], PADS: [], PERCUSSION: [], BASS: []
    };
    for (const prompt of newPrompts.values()) {
        if (CATEGORIES.LEAD.includes(prompt.text)) promptsByCategory.LEAD.push(prompt);
        else if (CATEGORIES.PADS.includes(prompt.text)) promptsByCategory.PADS.push(prompt);
        else if (CATEGORIES.PERCUSSION.includes(prompt.text)) promptsByCategory.PERCUSSION.push(prompt);
        else if (CATEGORIES.BASS.includes(prompt.text)) promptsByCategory.BASS.push(prompt);
    }

    const getRandomItem = <T>(arr: T[]): T | undefined => arr[Math.floor(Math.random() * arr.length)];
    
    const selectedPrompts = [
        getRandomItem(promptsByCategory.LEAD),
        getRandomItem(promptsByCategory.PADS),
        getRandomItem(promptsByCategory.PERCUSSION),
        getRandomItem(promptsByCategory.BASS),
    ].filter((p): p is Prompt => p !== undefined);


    // 3. Add them to the mixer panel and 4. Set their levels to a random value.
    for (const selectedPrompt of selectedPrompts) {
      const promptToUpdate = newPrompts.get(selectedPrompt.promptId)!;
      // Set random weight (0.0 to 2.0)
      promptToUpdate.weight = Math.random() * 2;
      // Add to mixer
      newMixerPromptIds.add(promptToUpdate.promptId);
    }
    
    this.prompts = newPrompts;
    this.mixerPromptIds = newMixerPromptIds;
    
    // Deselect presets
    this.activePreset = null;
    this.activeCustomPreset = null;
    
    this.requestUpdate();
    
    // Dispatch the change with only active prompts
    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.activePromptsList }),
    );
  }

  private handleMasterVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    this.masterVolume = parseFloat(target.value);
    this.dispatchEvent(new CustomEvent('master-volume-changed', { detail: this.masterVolume }));
  }

  private handleFluxActiveChanged(e: CustomEvent<boolean>) {
    this.fluxActive = e.detail;
    if (this.fluxActive) {
        this.startFluxTimer();
        this.startFluxCountdown();
    } else {
        this.stopFluxTimer();
        this.stopFluxCountdown();
    }
  }

  private handleFluxPromptsChanged(e: CustomEvent<Set<string>>) {
    this.fluxPrompts = e.detail;
  }
  
  private handleFluxSync() {
    const activePromptIds = this.activePromptsList.map(p => p.promptId);
    this.fluxPrompts = new Set(activePromptIds);
  }

  private handleFluxSettingsChanged(e: CustomEvent<{ amountMin: number; amountMax: number; chance: number; interval: number }>) {
    const { amountMin, amountMax, chance, interval } = e.detail;
    this.fluxAmountMin = amountMin;
    this.fluxAmountMax = amountMax;
    this.fluxChance = chance;
    
    if (this.fluxInterval !== interval) {
      this.fluxInterval = interval;
      if (this.fluxActive) {
        // Restart timer with new interval
        this.startFluxTimer();
        this.startFluxCountdown();
      } else {
        // If not active, just update the displayed countdown value
        this.fluxCountdown = this.fluxInterval;
      }
    }
  }
  
  private startFluxTimer() {
    this.stopFluxTimer(); // Ensure no multiple timers
    this.fluxIntervalId = window.setInterval(() => this.tickFlux(), this.fluxInterval * 1000);
  }

  private stopFluxTimer() {
    if (this.fluxIntervalId !== null) {
        clearInterval(this.fluxIntervalId);
        this.fluxIntervalId = null;
    }
  }

  private startFluxCountdown() {
    this.stopFluxCountdown();
    this.fluxCountdown = this.fluxInterval;
    this.fluxCountdownIntervalId = window.setInterval(() => {
      this.fluxCountdown = this.fluxCountdown > 1 ? this.fluxCountdown - 1 : this.fluxInterval;
    }, 1000);
  }

  private stopFluxCountdown() {
    if (this.fluxCountdownIntervalId !== null) {
      clearInterval(this.fluxCountdownIntervalId);
      this.fluxCountdownIntervalId = null;
    }
    this.fluxCountdown = this.fluxInterval;
  }
  
  private tickFlux() {
    if (!this.fluxActive || this.fluxPrompts.size === 0) {
      return;
    }
  
    const newPrompts = new Map(this.prompts);
  
    this.fluxPrompts.forEach(promptId => {
      // Check if this instrument should be changed based on the chance
      if (Math.random() * 100 < this.fluxChance) {
        const prompt = newPrompts.get(promptId);
        if (prompt) {
          // Determine random amount within the min/max range
          const randomAmount = this.fluxAmountMin + Math.random() * (this.fluxAmountMax - this.fluxAmountMin);
          const changeAmount = (randomAmount / 100) * 2.0;
          
          const direction = Math.random() < 0.5 ? -1 : 1;
          const change = changeAmount * direction;
          
          let newWeight = prompt.weight + change;
          newWeight = Math.max(0, Math.min(2, newWeight));
          
          newPrompts.set(promptId, { ...prompt, weight: newWeight });
        }
      }
    });
  
    this.prompts = newPrompts;
    this.requestUpdate();
    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.activePromptsList }),
    );
  }

  // Fix: removed `override` modifier which was causing compilation errors.
  render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });
    const mixerPrompts = this.getMixerPrompts();
    const allPrompts = [...this.prompts.values()];

    return html`<div id="background" style=${bg}></div>
      <div id="top-bar">
        <div id="midi-controls">
          <button
            @click=${this.toggleMasterMixer}
            class=${this.isMasterMixerActive ? 'active' : ''}
            title="Add/remove all active prompts to/from mixer"
          >Mixer</button>
          <button
            @click=${this.toggleFluxPanel}
            class=${this.fluxPanelVisible ? 'active' : ''}
            title="Toggle Flux Capacitor panel"
          >Flux</button>
          <button
            @click=${this.toggleShowMidi}
            class=${this.showMidi ? 'active' : ''}
            title="Toggle MIDI learn mode and select input device."
            >MIDI</button
          >
          <button
            @click=${this.toggleFade}
            class=${this.fadeEnabled ? 'active' : ''}
            title="Toggle 5-second fade in/out"
          >Fade</button>
          <select
            @change=${this.handleMidiInputChange}
            .value=${this.activeMidiInputId || ''}
            style=${this.showMidi ? '' : 'visibility: hidden'}>
            ${this.midiInputIds.length > 0
        ? this.midiInputIds.map(
          (id) =>
            html`<option value=${id}>
                    ${this.midiDispatcher.getDeviceName(id)}
                  </option>`,
        )
        : html`<option value="">No devices found</option>`}
          </select>
        </div>
        <div id="dimming-bar-container">
          <input
            type="range"
            id="master-volume"
            min="0"
            max="1"
            step="0.01"
            .value=${String(this.masterVolume)}
            @input=${this.handleMasterVolumeChange}
            title="Master Volume"
          />
        </div>
        <div id="presets">
          <div id="stock-presets">
            <button
              class=${this.activePreset === 'Sci-fi Story' ? 'active' : ''}
              @click=${() => this.applyPreset('Sci-fi Story')}
              title="A cinematic and atmospheric preset with choir, arpeggios, and a retro synthwave vibe.">Sci-fi Story</button>
            <button
              class=${this.activePreset === 'Space Station' ? 'active' : ''}
              @click=${() => this.applyPreset('Space Station')}
              title="An industrial and tense preset featuring a powerful synth lead, ominous strings, and dystopian sounds.">Space Station</button>
            <button
              class=${this.activePreset === 'Cosmic Anomaly' ? 'active' : ''}
              @click=${() => this.applyPreset('Cosmic Anomaly')}
              title="A mysterious and alien soundscape with deep drones, strange vocals, and cybernetic rhythms.">Cosmic Anomaly</button>
          </div>
          <div id="custom-presets">
            ${Object.keys(this.customPresets).map(presetName => {
              const isFilled = Object.keys(this.customPresets[presetName]).length > 0;
              return html`
                <button
                  class=${this.activeCustomPreset === presetName ? 'active' : ''}
                  @click=${() => this.applyCustomPreset(presetName)}>
                  ${presetName}${isFilled ? ' *' : ''}
                </button>
              `;
            })}
          </div>
          <div id="preset-actions">
            <button @click=${this.handleSaveClick} ?disabled=${!this.activeCustomPreset} title="Save the current controller weights to the selected custom preset slot.">Save</button>
            <button @click=${this.clearControllers} title="Set all controller weights to zero and clear the mixer.">Clear</button>
            <button @click=${this.randomizeControllers} title="Generate a new soundscape by randomly selecting one instrument from each musical category.">Randomize</button>
          </div>
        </div>
      </div>
      <div id="main-layout">
        ${(mixerPrompts.length > 0 || this.fluxPanelVisible) ? html`
          <div id="left-panels">
            ${this.fluxPanelVisible ? html`
              <flux-panel
                .prompts=${allPrompts}
                .fluxPrompts=${this.fluxPrompts}
                .fluxActive=${this.fluxActive}
                .fluxAmountMin=${this.fluxAmountMin}
                .fluxAmountMax=${this.fluxAmountMax}
                .fluxChance=${this.fluxChance}
                .fluxInterval=${this.fluxInterval}
                .fluxCountdown=${this.fluxCountdown}
                @flux-active-changed=${this.handleFluxActiveChanged}
                @flux-prompts-changed=${this.handleFluxPromptsChanged}
                @flux-settings-changed=${this.handleFluxSettingsChanged}
                @flux-sync-requested=${this.handleFluxSync}
              ></flux-panel>
            ` : ''}
            ${mixerPrompts.length > 0 ? html`
              <mixer-panel .prompts=${mixerPrompts} .audioLevel=${this.audioLevel} @prompt-changed=${this.handlePromptChanged}></mixer-panel>
            ` : ''}
          </div>
        ` : html`<div class="panel-placeholder"></div>`}

        <div id="grid-container">
          <div id="grid">${this.renderPrompts()}</div>
          <play-pause-button .playbackState=${this.playbackState} @click=${this.playPause}></play-pause-button>
        </div>
        <visualizer-panel .prompts=${allPrompts} .audioLevel=${this.audioLevel} .playbackState=${this.playbackState}></visualizer-panel>
      </div>
      `;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        ?selected=${this.mixerPromptIds.has(prompt.promptId)}
        cc=${prompt.cc}
        text=${prompt.text}
        description=${prompt.description}
        weight=${prompt.weight}
        color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}
        @prompt-selected=${this.handlePromptSelected}>
      </prompt-controller>`;
    });
  }
}
