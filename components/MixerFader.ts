/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { Prompt } from '../types';

@customElement('mixer-fader')
export class MixerFader extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      height: 100%;
      background: #222;
      border-radius: 4px;
      padding: 10px 5px;
      box-sizing: border-box;
      position: relative;
      border: 1px solid #444;
      color: #fff;
    }
    .fader-track {
      position: relative;
      width: 10px;
      flex-grow: 1;
      background: #111;
      border-radius: 5px;
      overflow: hidden;
      margin: 10px 0;
    }
    .vu-meter {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background-color: var(--prompt-color, #fff);
      opacity: 0.6;
      transition: height 0.1s linear;
    }
    input[type='range'] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 100%;
      background: transparent;
      position: absolute;
      top: 0;
      left: 0;
      margin: 0;
      writing-mode: bt-lr; /* IE */
      -webkit-appearance: slider-vertical; /* WebKit */
    }
    input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 30px;
      height: 10px;
      background: #eee;
      border: 1px solid #999;
      border-radius: 2px;
      cursor: ns-resize;
      margin-left: -10px;
    }
    input[type='range']::-moz-range-thumb {
      width: 30px;
      height: 10px;
      background: #eee;
      border: 1px solid #999;
      border-radius: 2px;
      cursor: ns-resize;
    }
    .label {
      font-size: 1.5vmin;
      font-weight: 500;
      color: #fff;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      height: 2em;
      line-height: 1em;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .value-container {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #111;
      padding: 2px 4px;
      border-radius: 3px;
    }
    .value-input {
      font-family: monospace;
      font-size: 1.4vmin;
      color: #ccc;
      background: transparent;
      border: none;
      outline: none;
      width: 2.5em;
      text-align: right;
      padding: 0;
      -moz-appearance: textfield;
    }
    .value-input::-webkit-outer-spin-button,
    .value-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .percent-sign {
      font-family: monospace;
      font-size: 1.2vmin;
      color: #ccc;
    }
  `;

  @property({ type: Object }) prompt!: Prompt;
  @property({ type: Number }) audioLevel = 0;

  private onFaderInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const weight = parseFloat(target.value);
    this.dispatchChange(weight);
  }
  
  private onValueKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  }
  
  private onValueChange(e: Event) {
    const target = e.target as HTMLInputElement;
    let percentage = parseInt(target.value, 10);
    
    if (isNaN(percentage)) {
      this.requestUpdate(); // Revert to original value by re-rendering
      return;
    }
    
    percentage = Math.max(0, Math.min(100, percentage));
    
    const weight = (percentage / 100) * 2;
    this.dispatchChange(weight);
  }

  private dispatchChange(weight: number) {
    // Clamp weight to valid range just in case
    const clampedWeight = Math.max(0, Math.min(2, weight));
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          ...this.prompt,
          weight: clampedWeight,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private abbreviate(text: string): string {
    const words = text.split(' ');
    // Don't abbreviate short, single words
    if (words.length === 1 && text.length <= 8) {
      return text;
    }
    const abbreviated = words.map(word => {
      // Keep short words with numbers as they are (e.g., '80s')
      if (/\d/.test(word) && word.length < 4) {
        return word;
      }
      // Otherwise, take the first letter
      return word.substring(0, 1);
    }).join('');
    return abbreviated;
  }

  // FIX: The 'override' keyword is required for lifecycle methods when extending LitElement 
  // to ensure correct type inference and functionality.
  override render() {
    if (!this.prompt) return html``;

    const vuStyle = styleMap({
      height: `${this.audioLevel * 100}%`,
      backgroundColor: this.prompt.color,
    });

    const percentage = ((this.prompt.weight / 2) * 100).toFixed(0);

    return html`
      <div class="label" title=${this.prompt.text}>${this.abbreviate(this.prompt.text)}</div>
      <div class="fader-track">
        <div class="vu-meter" style=${vuStyle}></div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          .value=${String(this.prompt.weight)}
          @input=${this.onFaderInput} />
      </div>
      <div class="value-container">
        <input
          class="value-input"
          type="number"
          min="0"
          max="100"
          .value=${percentage}
          @keydown=${this.onValueKeydown}
          @change=${this.onValueChange}
        />
        <span class="percent-sign">%</span>
      </div>
    `;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    'mixer-fader': MixerFader;
  }
}