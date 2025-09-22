/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Prompt } from '../types';
import './MixerFader';

@customElement('mixer-panel')
export class MixerPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      width: 100%;
      padding: 1vmin;
      box-sizing: border-box;
      gap: 0.5vmin;
      background: rgba(0,0,0,0.3);
      border: 1px solid #555;
      border-radius: 8px;
    }
    .fader-group {
      display: flex;
      flex-direction: row; /* Faders are in a row */
      gap: 0.5vmin;
      flex: 1; /* Each group takes half the vertical space */
      min-height: 0;
    }
    mixer-fader {
      /* (Panel Content Width - (NumGaps * GapWidth)) / NumFaders */
      /* ((30 - 2*Padding) - (4 * 0.5)) / 5 => (28 - 2) / 5 = 5.2 */
      width: 5.2vmin;
      height: 100%;
    }
  `;

  @property({ type: Array }) prompts: Prompt[] = [];
  @property({ type: Number }) audioLevel = 0;

  // FIX: The 'override' keyword is required for lifecycle methods when extending LitElement 
  // to ensure correct type inference and functionality.
  override render() {
    const group1 = this.prompts.slice(0, 5);
    const group2 = this.prompts.slice(5, 10);

    return html`
      <div class="fader-group">
        ${group1.map(
          (prompt) => html`
            <mixer-fader
              .prompt=${prompt}
              .audioLevel=${this.audioLevel}
            ></mixer-fader>
          `,
        )}
      </div>
      ${group2.length > 0
        ? html`
            <div class="fader-group">
              ${group2.map(
                (prompt) => html`
                  <mixer-fader
                    .prompt=${prompt}
                    .audioLevel=${this.audioLevel}
                  ></mixer-fader>
                `,
              )}
            </div>
          `
        : ''}
    `;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    'mixer-panel': MixerPanel;
  }
}