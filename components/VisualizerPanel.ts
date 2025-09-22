/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, svg, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { PlaybackState, Prompt } from '../types';

@customElement('visualizer-panel')
export class VisualizerPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 80vmin;
      width: 30vmin;
      background: #111;
      border-left: 1px solid #555;
      border-radius: 8px;
      margin-right: 1vmin;
      overflow: hidden;
    }
    svg {
      width: 100%;
      height: 100%;
    }
    path {
      fill: none;
      stroke-width: 3;
      mix-blend-mode: screen;
      transition: stroke-width 0.1s linear;
    }
  `;

  @property({ type: Array }) prompts: Prompt[] = [];
  @property({ type: Number }) audioLevel = 0;
  @property({ type: String }) playbackState: PlaybackState = 'stopped';

  @state() private paths: { d: string; stroke: string; strokeWidth: number }[] = [];

  private animationFrameId = 0;
  private startTime = 0;

  // FIX: The 'override' keyword is required for lifecycle methods when extending LitElement 
  // to ensure correct type inference and functionality.
  override connectedCallback() {
    super.connectedCallback();
    this.startTime = performance.now();
    this.runAnimationLoop();
  }

  // FIX: The 'override' keyword is required for lifecycle methods when extending LitElement 
  // to ensure correct type inference and functionality.
  override disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.animationFrameId);
  }

  private runAnimationLoop() {
    this.updatePaths();
    this.animationFrameId = requestAnimationFrame(() => this.runAnimationLoop());
  }

  private updatePaths() {
    const activePrompts = this.prompts.filter((p) => p.weight > 0);
    const width = this.clientWidth;
    const height = this.clientHeight;
    if (width === 0 || height === 0) {
      this.paths = [];
      return;
    }

    // "Deadlined" state: render static lines if not playing
    if (this.playbackState !== 'playing') {
      const numLines = activePrompts.length;
      if (numLines === 0) {
        this.paths = [];
        return;
      }
      // Group lines in the center for a smooth transition
      const fixedSpacing = 10; // A small gap between lines
      const totalHeightOfLines = (numLines - 1) * fixedSpacing;
      const startY = (height - totalHeightOfLines) / 2;

      this.paths = activePrompts.map((prompt, index) => {
        const y = startY + index * fixedSpacing;
        return {
          d: `M 0 ${y} L ${width} ${y}`,
          stroke: prompt.color,
          strokeWidth: 2 + prompt.weight * 3,
        };
      });
      return;
    }

    // "Playing" state: render animated sine waves
    const centerY = height / 2;
    const time = (performance.now() - this.startTime) * 0.001; // Time in seconds

    this.paths = activePrompts.map((prompt, index) => {
      // Amplitude is a factor of the prompt's weight and the overall audio level,
      // creating a "lively" pulse that reflects its contribution to the mix.
      const amplitude =
        (prompt.weight / 2) * (centerY * 0.8) * (0.2 + this.audioLevel * 2);

      // Use index to vary frequency for criss-cross effect
      const frequency = 0.02 + index * 0.005;

      // New exponential speed logic.
      const normalizedWeight = prompt.weight / 2;
      // An exponential curve mapping weight [0, 2] to speed [6, 0.5]
      // speed = minSpeed + (maxSpeed - minSpeed) * (1 - normalizedWeight)^exponent
      const speed = 0.5 + 5.5 * Math.pow(1 - normalizedWeight, 3);

      // Use time and speed to animate the phase, creating movement
      const phase = time * speed;

      let pathData = `M 0 ${centerY}`;
      const points = 100; // Number of points to draw the wave for smoothness

      for (let i = 0; i <= points; i++) {
        const x = (i / points) * width;
        // The sine wave originates from the vertical center of the panel
        const y = centerY + amplitude * Math.sin(frequency * x + phase + index);
        pathData += ` L ${x} ${y}`;
      }

      return {
        d: pathData,
        stroke: prompt.color,
        strokeWidth: 3,
      };
    });
  }


  // FIX: The 'override' keyword is required for lifecycle methods when extending LitElement 
  // to ensure correct type inference and functionality.
  override render() {
    // Using clientWidth/Height for the viewBox ensures the SVG coordinates match
    // the actual pixel dimensions of the container.
    return html`
      <svg viewBox="0 0 ${this.clientWidth} ${this.clientHeight}">
        ${this.paths.map(
          (p) => svg`<path d=${p.d} stroke=${p.stroke} stroke-width=${p.strokeWidth}></path>`,
        )}
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'visualizer-panel': VisualizerPanel;
  }
}