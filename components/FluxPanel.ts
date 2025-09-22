/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Prompt } from '../types';

@customElement('flux-panel')
export class FluxPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      width: 100%;
      padding: 1vmin;
      box-sizing: border-box;
      gap: 1vmin;
      background: rgba(0,0,0,0.3);
      border: 1px solid #555;
      border-radius: 8px;
      color: #fff;
      font-size: 1.6vmin;
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h3 {
      margin: 0;
      text-align: center;
      font-weight: 500;
      color: #00e5ff;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .activate-toggle {
      display: flex;
      align-items: center;
      gap: 0.5vmin;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
    }
    input[type="checkbox"] {
      cursor: pointer;
      width: 1.8vmin;
      height: 1.8vmin;
    }
    .prompt-list-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 0.5vmin;
    }
    .sync-button {
      background: #333;
      border: 1px solid #555;
      color: #fff;
      border-radius: 50%;
      width: 2.2vmin;
      height: 2.2vmin;
      cursor: pointer;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2vmin;
      line-height: 1;
      padding-bottom: 0.2vmin;
    }
    .prompt-list {
      flex-grow: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.5vmin;
      border: 1px solid #444;
      background: #222;
      padding: 0.5vmin;
      border-radius: 4px;
    }
    .prompt-item {
      display: flex;
      align-items: center;
      gap: 1vmin;
      cursor: pointer;
      user-select: none;
    }
    .settings {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1vmin;
    }
    .setting {
      display: flex;
      flex-direction: column;
      gap: 0.5vmin;
    }
    .amount-range {
      display: flex;
      align-items: center;
      gap: 0.5vmin;
    }
    label {
      font-weight: 500;
    }
    input[type="number"] {
      width: 5vmin;
      background: #111;
      color: #fff;
      border: 1px solid #555;
      border-radius: 3px;
      padding: 0.5vmin;
      font-family: monospace;
      text-align: center;
      -moz-appearance: textfield;
    }
    input[type="number"]::-webkit-outer-spin-button,
    input[type="number"]::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    input[type="range"] {
      width: 100%;
    }
    .timer-setting {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .countdown-value {
        color: #00e5ff;
        font-weight: bold;
        font-family: monospace;
    }
  `;

  @property({ type: Array }) prompts: Prompt[] = [];
  @property({ type: Object }) fluxPrompts = new Set<string>();
  @property({ type: Number }) fluxAmountMin = 15;
  @property({ type: Number }) fluxAmountMax = 30;
  @property({ type: Number }) fluxChance = 50;
  @property({ type: Number }) fluxInterval = 35;
  @property({ type: Boolean }) fluxActive = false;
  @property({ type: Number }) fluxCountdown = 35;
  @property({ type: Boolean }) isSyncActive = false;

  private handleActivateToggle(e: Event) {
    const target = e.target as HTMLInputElement;
    this.dispatchEvent(new CustomEvent('flux-active-changed', { detail: target.checked, bubbles: true, composed: true }));
  }

  private handlePromptToggle(e: Event, promptId: string) {
    const target = e.target as HTMLInputElement;
    const newSet = new Set(this.fluxPrompts);
    if (target.checked) {
      newSet.add(promptId);
    } else {
      newSet.delete(promptId);
    }
    this.dispatchEvent(new CustomEvent('flux-prompts-changed', { detail: newSet, bubbles: true, composed: true }));
  }

  private handleSettingsChange() {
    const amountMinInput = this.shadowRoot?.getElementById('flux-amount-min') as HTMLInputElement;
    const amountMaxInput = this.shadowRoot?.getElementById('flux-amount-max') as HTMLInputElement;
    const chanceInput = this.shadowRoot?.getElementById('flux-chance') as HTMLInputElement;
    const intervalInput = this.shadowRoot?.getElementById('flux-interval') as HTMLInputElement;
    
    let amountMin = parseInt(amountMinInput.value, 10);
    let amountMax = parseInt(amountMaxInput.value, 10);
    let chance = parseInt(chanceInput.value, 10);
    let interval = parseInt(intervalInput.value, 10);

    // Basic validation and clamping
    amountMin = isNaN(amountMin) ? 1 : Math.max(1, Math.min(100, amountMin));
    amountMax = isNaN(amountMax) ? 1 : Math.max(1, Math.min(100, amountMax));
    chance = isNaN(chance) ? 0 : Math.max(0, Math.min(100, chance));
    interval = isNaN(interval) ? 1 : Math.max(1, Math.min(99, interval));

    // Ensure min is not greater than max
    if (amountMin > amountMax) {
      amountMin = amountMax;
    }
    
    // Update inputs if values were clamped
    amountMinInput.value = String(amountMin);
    amountMaxInput.value = String(amountMax);
    chanceInput.value = String(chance);
    intervalInput.value = String(interval);
    
    this.dispatchEvent(new CustomEvent('flux-settings-changed', {
        detail: { amountMin, amountMax, chance, interval },
        bubbles: true,
        composed: true
    }));
  }
  
  private syncWithMix() {
    this.dispatchEvent(new CustomEvent('flux-sync-requested', { bubbles: true, composed: true }));
  }

  // FIX: The 'override' keyword is required for lifecycle methods when extending LitElement 
  // to ensure correct type inference and functionality.
  override render() {
    const syncTitle = this.isSyncActive
        ? 'Remove all active instruments from Flux Group'
        : 'Add all active instruments to Flux Group';

    return html`
      <div class="panel-header">
        <h3>Flux Capacitor</h3>
        <label class="activate-toggle">
            <input type="checkbox" .checked=${this.fluxActive} @change=${this.handleActivateToggle}>
            Activate
        </label>
      </div>
      
      <div class="prompt-list-header">
        <span>Flux Group</span>
        <button class="sync-button" @click=${this.syncWithMix} title=${syncTitle}>${this.isSyncActive ? '−' : '+'}</button>
      </div>
      <div class="prompt-list">
        ${this.prompts.map(prompt => html`
          <label class="prompt-item">
            <input 
                type="checkbox" 
                .checked=${this.fluxPrompts.has(prompt.promptId)}
                @change=${(e: Event) => this.handlePromptToggle(e, prompt.promptId)}
            >
            <span style="color: ${prompt.color}; text-shadow: 0 0 2px ${prompt.color};">${prompt.text}</span>
          </label>
        `)}
      </div>

      <div class="settings">
        <div class="setting">
            <label for="flux-amount-min">Amount (%):</label>
            <div class="amount-range">
                <input id="flux-amount-min" type="number" .value=${String(this.fluxAmountMin)} @change=${this.handleSettingsChange} min="1" max="100">
                <span>-</span>
                <input id="flux-amount-max" type="number" .value=${String(this.fluxAmountMax)} @change=${this.handleSettingsChange} min="1" max="100">
            </div>
        </div>
        <div class="setting">
            <label for="flux-chance">Chance (${this.fluxChance}%):</label>
            <input id="flux-chance" type="range" .value=${String(this.fluxChance)} @input=${this.handleSettingsChange} min="0" max="100">
        </div>
      </div>
      
      <div class="timer-setting">
        <div>
            <label for="flux-interval">Interval (s):</label>
            <input id="flux-interval" type="number" .value=${String(this.fluxInterval)} @change=${this.handleSettingsChange} min="1" max="99">
        </div>
        <div class="countdown">
          Next: <span class="countdown-value">${this.fluxActive ? this.fluxCountdown : '--'}s</span>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'flux-panel': FluxPanel;
  }
}