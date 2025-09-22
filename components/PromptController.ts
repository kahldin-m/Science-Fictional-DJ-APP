/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import './WeightKnob';
import type { WeightKnob } from './WeightKnob';

import type { MidiDispatcher } from '../utils/MidiDispatcher';
import type { Prompt, ControlChange } from '../types';

/** A single prompt input associated with a MIDI CC. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  // Fix: removed `override` modifier which was causing compilation errors.
  static styles = css`
    .prompt {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    weight-knob {
      width: 70%;
      flex-shrink: 0;
    }
    #midi {
      font-family: monospace;
      text-align: center;
      font-size: 1.5vmin;
      border: 0.2vmin solid #fff;
      border-radius: 0.5vmin;
      padding: 2px 5px;
      color: #fff;
      background: #0006;
      cursor: pointer;
      visibility: hidden;
      user-select: none;
      margin-top: 0.75vmin;
      .learn-mode & {
        color: orange;
        border-color: orange;
      }
      .show-cc & {
        visibility: visible;
      }
    }
    #text {
      font-weight: 500;
      font-size: 1.8vmin;
      max-width: 17vmin;
      min-width: 2vmin;
      padding: 0.1em 0.3em;
      margin-top: 0.5vmin;
      flex-shrink: 0;
      border-radius: 0.25vmin;
      text-align: center;
      white-space: pre;
      overflow: hidden;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      background: #000;
      color: #fff;
      &:not(:focus) {
        text-overflow: ellipsis;
      }
    }
    :host([filtered]) {
      weight-knob { 
        opacity: 0.5;
      }
      #text {
        background: #da2000;
        z-index: 1;
      }
    }
    #select-button {
      position: absolute;
      top: 0;
      right: 0;
      width: 2.5vmin;
      height: 2.5vmin;
      background: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5vmin;
      font-weight: bold;
      user-select: none;
      transition: background-color 0.2s, color 0.2s;
      z-index: 2;
    }
    #select-button:hover {
      background-color: #555;
    }
    :host([selected]) #select-button {
      background-color: var(--prompt-color, orange);
      color: #000;
      border-color: #fff;
    }
    @media only screen and (max-width: 600px) {
      #text {
        font-size: 2.3vmin;
      }
      weight-knob {
        width: 60%;
      }
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: String }) description = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '';
  @property({ type: Boolean, reflect: true }) filtered = false;
  @property({ type: Boolean, reflect: true }) selected = false;

  @property({ type: Number }) cc = 0;
  @property({ type: Number }) channel = 0; // Not currently used

  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;

  @query('weight-knob') private weightInput!: WeightKnob;
  @query('#text') private textInput!: HTMLInputElement;

  @property({ type: Object })
  midiDispatcher: MidiDispatcher | null = null;

  @property({ type: Number }) audioLevel = 0;

  private lastValidText!: string;

  // Fix: removed `override` modifier which was causing compilation errors.
  connectedCallback() {
    super.connectedCallback();
    this.midiDispatcher?.addEventListener('cc-message', (e: Event) => {
      const customEvent = e as CustomEvent<ControlChange>;
      const { channel, cc, value } = customEvent.detail;
      if (this.learnMode) {
        this.cc = cc;
        this.channel = channel;
        this.learnMode = false;
        this.dispatchPromptChange();
      } else if (cc === this.cc) {
        this.weight = (value / 127) * 2;
        this.dispatchPromptChange();
      }
    });
  }

  // Fix: removed `override` modifier which was causing compilation errors.
  firstUpdated() {
    // contenteditable is applied to textInput so we can "shrink-wrap" to text width
    // It's set here and not render() because Lit doesn't believe it's a valid attribute.
    this.textInput.setAttribute('contenteditable', 'plaintext-only');

    // contenteditable will do weird things if this is part of the template.
    this.textInput.textContent = this.text;
    this.lastValidText = this.text;
  }

  // Fix: removed `override` modifier which was causing compilation errors.
  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('showCC') && !this.showCC) {
      this.learnMode = false;
    }
    if (changedProperties.has('text') && this.textInput) {
      this.textInput.textContent = this.text;
    }
    super.update(changedProperties);
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          description: this.description,
          weight: this.weight,
          cc: this.cc,
          color: this.color,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.textInput.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.resetText();
      this.textInput.blur();
    }
  }

  private resetText() {
    this.text = this.lastValidText;
    this.textInput.textContent = this.lastValidText;
  }

  private async updateText() {
    const newText = this.textInput.textContent?.trim();
    if (!newText) {
      this.resetText();
    } else {
      this.text = newText;
      this.lastValidText = newText;
    }
    this.dispatchPromptChange();
    // Show the prompt from the beginning if it's cropped
    this.textInput.scrollLeft = 0;
  }

  private onFocus() {
    // .select() for contenteditable doesn't work.
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(this.textInput);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private updateWeight() {
    this.weight = this.weightInput.value;
    this.dispatchPromptChange();
  }

  private toggleLearnMode() {
    this.learnMode = !this.learnMode;
  }
  
  private toggleSelected() {
    this.dispatchEvent(
      new CustomEvent('prompt-selected', {
        detail: {
          promptId: this.promptId,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Fix: removed `override` modifier which was causing compilation errors.
  render() {
    const classes = classMap({
      'prompt': true,
      'learn-mode': this.learnMode,
      'show-cc': this.showCC,
    });
    const selectButtonStyles = styleMap({
      '--prompt-color': this.color,
    });
    return html`<div class=${classes}>
      <div
        id="select-button"
        style=${selectButtonStyles}
        @click=${this.toggleSelected}
        title="Add to mixer">
        ${this.selected ? '✔' : '+'}
      </div>
      <weight-knob
        id="weight"
        value=${this.weight}
        color=${this.filtered ? '#888' : this.color}
        audioLevel=${this.filtered ? 0 : this.audioLevel}
        @input=${this.updateWeight}></weight-knob>
      <span
        id="text"
        spellcheck="false"
        title=${this.description}
        @focus=${this.onFocus}
        @keydown=${this.onKeyDown}
        @blur=${this.updateText}></span>
      <div id="midi" @click=${this.toggleLearnMode}>
        ${this.learnMode ? 'Learn' : `CC:${this.cc}`}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}
