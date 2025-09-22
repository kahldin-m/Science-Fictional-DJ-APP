/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import type { PlaybackState, Prompt } from '../types';
import type { AudioChunk, GoogleGenAI, LiveMusicFilteredPrompt, LiveMusicServerMessage, LiveMusicSession } from '@google/genai';
import { decode, decodeAudioData } from './audio';
import { throttle } from './throttle';

const NO_ACTIVE_PROMPTS_ERROR = 'There needs to be one active prompt to play.';
export class LiveMusicHelper extends EventTarget {

  private ai: GoogleGenAI;
  private model: string;

  private session: LiveMusicSession | null = null;
  private sessionPromise: Promise<LiveMusicSession> | null = null;

  private connectionError = true;

  private filteredPrompts = new Set<string>();
  private nextStartTime = 0;
  private bufferTime = 2;

  public readonly audioContext: AudioContext;
  public extraDestination: AudioNode | null = null;
  public fadeEnabled = false;
  private readonly FADE_DURATION = 5; // in seconds

  private outputNode: GainNode;
  private masterGainNode: GainNode;
  private readonly highShelfFilter: BiquadFilterNode;
  private playbackState: PlaybackState = 'stopped';
  private fadeOutTimeoutId: number | null = null;

  constructor(ai: GoogleGenAI, model: string) {
    super();
    this.ai = ai;
    this.model = model;
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.outputNode = this.audioContext.createGain();
    this.masterGainNode = this.audioContext.createGain();

    // Create a high-shelf filter to tame harsh frequencies on specific instruments.
    this.highShelfFilter = this.audioContext.createBiquadFilter();
    this.highShelfFilter.type = 'highshelf';
    this.highShelfFilter.frequency.value = 8000; // Target frequencies above 8kHz
    this.highShelfFilter.gain.value = 0; // Default to no effect

    // Route audio through the nodes: auto-fade -> master-volume -> filter -> destination
    this.outputNode.connect(this.masterGainNode);
    this.masterGainNode.connect(this.highShelfFilter);
    this.highShelfFilter.connect(this.audioContext.destination);
  }

  private getSession(): Promise<LiveMusicSession> {
    if (!this.sessionPromise) this.sessionPromise = this.connect();
    return this.sessionPromise;
  }

  private async connect(): Promise<LiveMusicSession> {
    this.sessionPromise = this.ai.live.music.connect({
      model: this.model,
      callbacks: {
        onmessage: async (e: LiveMusicServerMessage) => {
          if (e.setupComplete) {
            this.connectionError = false;
          }
          if (e.filteredPrompt) {
            this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text!])
            this.dispatchEvent(new CustomEvent<LiveMusicFilteredPrompt>('filtered-prompt', { detail: e.filteredPrompt }));
          }
          if (e.serverContent?.audioChunks) {
            await this.processAudioChunks(e.serverContent.audioChunks);
          }
        },
        onerror: () => {
          this.connectionError = true;
          this.stop();
          this.dispatchEvent(new CustomEvent('error', { detail: 'Connection error, please restart audio.' }));
        },
        onclose: () => {
          this.connectionError = true;
          this.stop();
          this.dispatchEvent(new CustomEvent('error', { detail: 'Connection error, please restart audio.' }));
        },
      },
    });
    return this.sessionPromise;
  }

  private setPlaybackState(state: PlaybackState) {
    this.playbackState = state;
    this.dispatchEvent(new CustomEvent('playback-state-changed', { detail: state }));
  }

  private async processAudioChunks(audioChunks: AudioChunk[]) {
    // If playback has been paused or stopped, don't schedule new audio.
    if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;
    const audioBuffer = await decodeAudioData(
      decode(audioChunks[0].data!),
      this.audioContext,
      48000,
      2,
    );
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputNode);
    if (this.nextStartTime === 0) {
      this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
      setTimeout(() => {
        // Only transition to 'playing' if we are still 'loading'.
        // Avoids race conditions if stop() was called during the buffer time.
        if (this.playbackState === 'loading') {
          this.setPlaybackState('playing');
        }
      }, this.bufferTime * 1000);
    }
    if (this.nextStartTime < this.audioContext.currentTime) {
      this.setPlaybackState('loading');
      this.nextStartTime = 0;
      return;
    }
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  public readonly setWeightedPrompts = throttle(async (prompts: Prompt[]) => {
    const activePrompts = prompts.filter(p => !this.filteredPrompts.has(p.text));
    
    // Check if "Dystopian Industrial" is active and apply the high-shelf cut.
    const dystopianIndustrialPrompt = activePrompts.find(p => p.text === 'Dystopian Industrial');
    // Set target gain. -18dB is a significant cut.
    const targetGain = dystopianIndustrialPrompt ? -18 : 0;
    // Smoothly ramp to the target gain to avoid clicks.
    this.highShelfFilter.gain.cancelScheduledValues(this.audioContext.currentTime);
    this.highShelfFilter.gain.linearRampToValueAtTime(targetGain, this.audioContext.currentTime + 0.5); // 0.5 second ramp

    if (activePrompts.length === 0) {
      this.dispatchEvent(new CustomEvent('error', { detail: NO_ACTIVE_PROMPTS_ERROR }));
      this.pause();
      return;
    } else {
      this.dispatchEvent(new CustomEvent('error-cleared', { detail: NO_ACTIVE_PROMPTS_ERROR }));
    }

    if (!this.session) return;

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: activePrompts,
      });
    } catch (e: any) {
      this.dispatchEvent(new CustomEvent('error', { detail: e.message }));
      this.pause();
    }
  }, 200);

  public async play(activePrompts: Prompt[]) {
    // If a fade-out is in progress, cancel it.
    if (this.fadeOutTimeoutId) {
      clearTimeout(this.fadeOutTimeoutId);
      this.fadeOutTimeoutId = null;
    }

    this.setPlaybackState('loading');
    this.session = await this.getSession();
    await this.setWeightedPrompts(activePrompts);
    this.audioContext.resume();
    this.session.play();

    // The outputNode is already connected from the constructor.
    // Connect any extra destinations (like the analyser) from the filter node
    // so they receive the processed audio.
    if (this.extraDestination) this.highShelfFilter.connect(this.extraDestination);

    this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
    if (this.fadeEnabled) {
      // Start from a very small value to avoid clicks.
      this.outputNode.gain.setValueAtTime(0.0001, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + this.FADE_DURATION);
    } else {
      this.outputNode.gain.setValueAtTime(1, this.audioContext.currentTime);
    }
  }

  public pause() {
    // Prevent multiple pause actions.
    if (this.playbackState === 'paused' || this.playbackState === 'stopped') {
      return;
    }
    this.setPlaybackState('paused');

    const cleanup = () => {
      if (this.session) this.session.pause();
      this.nextStartTime = 0;
      this.fadeOutTimeoutId = null;
    };

    if (this.fadeEnabled) {
      this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(0.0001, this.audioContext.currentTime + this.FADE_DURATION);
      this.fadeOutTimeoutId = window.setTimeout(cleanup, this.FADE_DURATION * 1000);
    } else {
      this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      cleanup();
    }
  }

  public stop() {
    // Prevent multiple stop actions.
    if (this.playbackState === 'stopped') {
      return;
    }
    this.setPlaybackState('stopped');

    const cleanup = () => {
      if (this.session) this.session.stop();
      this.nextStartTime = 0;
      this.session = null;
      this.sessionPromise = null;
      this.fadeOutTimeoutId = null;
    };

    if (this.fadeEnabled) {
      this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
      this.outputNode.gain.linearRampToValueAtTime(0.0001, this.audioContext.currentTime + this.FADE_DURATION);
      this.fadeOutTimeoutId = window.setTimeout(cleanup, this.FADE_DURATION * 1000);
    } else {
      this.outputNode.gain.cancelScheduledValues(this.audioContext.currentTime);
      this.outputNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      cleanup();
    }
  }

  public async playPause(activePrompts: Prompt[]) {
    switch (this.playbackState) {
      case 'playing':
        return this.pause();
      case 'paused':
      case 'stopped':
        return this.play(activePrompts);
      case 'loading':
        return this.stop();
    }
  }

  public setMasterVolume(volume: number) {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.masterGainNode.gain.cancelScheduledValues(this.audioContext.currentTime);
    // Use a small ramp to avoid clicks from sudden volume changes.
    this.masterGainNode.gain.linearRampToValueAtTime(clampedVolume, this.audioContext.currentTime + 0.05);
  }

}