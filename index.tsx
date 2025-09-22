/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaybackState, Prompt } from './types';
import { GoogleGenAI, LiveMusicFilteredPrompt } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { LiveMusicHelper } from './utils/LiveMusicHelper';
import { AudioAnalyser } from './utils/AudioAnalyser';

// Fix: Use `process.env.API_KEY` and remove deprecated `apiVersion`.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = 'lyria-realtime-exp';

function main() {
  const initialPrompts = buildInitialPrompts();

  const pdjMidi = new PromptDjMidi(initialPrompts);
  document.body.appendChild(pdjMidi);

  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage);

  const liveMusicHelper = new LiveMusicHelper(ai, model);

  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.extraDestination = audioAnalyser.node;

  pdjMidi.addEventListener('prompts-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<Prompt[]>;
    const activePrompts = customEvent.detail;
    liveMusicHelper.setWeightedPrompts(activePrompts);
  }));

  pdjMidi.addEventListener('play-pause', (e: Event) => {
    const customEvent = e as CustomEvent<Prompt[]>;
    const activePrompts = customEvent.detail;
    liveMusicHelper.playPause(activePrompts);
  });

  pdjMidi.addEventListener('fade-toggled', ((e: Event) => {
    const customEvent = e as CustomEvent<boolean>;
    liveMusicHelper.fadeEnabled = customEvent.detail;
  }));

  pdjMidi.addEventListener('master-volume-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<number>;
    liveMusicHelper.setMasterVolume(customEvent.detail);
  }));

  liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<PlaybackState>;
    const playbackState = customEvent.detail;
    pdjMidi.playbackState = playbackState;
    playbackState === 'playing' ? audioAnalyser.start() : audioAnalyser.stop();
  }));

  liveMusicHelper.addEventListener('filtered-prompt', ((e: Event) => {
    const customEvent = e as CustomEvent<LiveMusicFilteredPrompt>;
    const filteredPrompt = customEvent.detail;
    toastMessage.show(filteredPrompt.filteredReason!)
    pdjMidi.addFilteredPrompt(filteredPrompt.text!);
  }));

  const errorToast = ((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const error = customEvent.detail;
    toastMessage.show(error);
  });

  liveMusicHelper.addEventListener('error', errorToast);
  pdjMidi.addEventListener('error', errorToast);

  liveMusicHelper.addEventListener('error-cleared', (e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const messageToClear = customEvent.detail;
    if (toastMessage.message === messageToClear && toastMessage.showing) {
      toastMessage.hide();
    }
  });

  audioAnalyser.addEventListener('audio-level-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<number>;
    const level = customEvent.detail;
    pdjMidi.audioLevel = level;
  }));

}

function buildInitialPrompts() {
  // Pick 3 random prompts to start at weight = 1
  const startOn = [...DEFAULT_PROMPTS]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const prompts = new Map<string, Prompt>();

  for (let i = 0; i < DEFAULT_PROMPTS.length; i++) {
    const promptId = `prompt-${i}`;
    const prompt = DEFAULT_PROMPTS[i];
    const { text, color } = prompt;
    prompts.set(promptId, {
      promptId,
      text,
      description: PROMPT_DESCRIPTIONS.get(text) || '',
      weight: startOn.includes(prompt) ? 1 : 0,
      cc: i,
      color,
    });
  }

  return prompts;
}

const DEFAULT_PROMPTS = [
  // Lead & Melodic
  { color: '#fd7e14', text: 'Analog Synth Lead' },
  { color: '#ffdd28', text: 'Utopian Melody' },
  { color: '#2af6de', text: 'Glimmering Synth Arpeggios' },
  { color: '#ff25f6', text: '80s Retro Synthwave' },
  // Pads & Atmosphere
  { color: '#d9b2ff', text: 'Celestial Choir Pads' },
  { color: '#990000', text: 'Ominous Strings' },
  { color: '#003366', text: 'Deep Space Drone' },
  { color: '#ffc107', text: 'Cinematic Brass' },
  // Percussion & Rhythm
  { color: '#d8ff3e', text: 'Glitchy, Staccato Beat' },
  { color: '#C0C0C0', text: 'Cybernetic Rhythms' },
  { color: '#9900ff', text: 'Robotic Percussion' },
  { color: '#696969', text: 'Dystopian Industrial' },
  // Bass & FX
  { color: '#5200ff', text: 'Pulsing Sub Bass' },
  { color: '#007bff', text: 'Warp Drive Hum' },
  { color: '#ff4500', text: 'Laser Blasts' },
  { color: '#3dffab', text: 'Alien Vocal Samples' },
];

const PROMPT_DESCRIPTIONS = new Map<string, string>([
    ['Analog Synth Lead', 'A classic, powerful, and raw monophonic lead voice, perfect for cutting through the mix.'],
    ['Utopian Melody', 'A bright, optimistic, and flowing melodic line that evokes a sense of hope and wonder.'],
    ['Glimmering Synth Arpeggios', 'Fast, shimmering, and cascading notes that add energy, complexity, and a futuristic feel.'],
    ['80s Retro Synthwave', 'Nostalgic and bold synth melodies with a distinct, chorus-laden vintage vibe.'],
    ['Celestial Choir Pads', 'Ethereal, sweeping vocal pads that create a vast, atmospheric, and cosmic soundscape.'],
    ['Ominous Strings', 'Tense, dramatic, and sustained string sections that build suspense and a sense of impending doom.'],
    ['Deep Space Drone', 'A low, continuous, and evolving hum that provides a deep, textural foundation of emptiness and scale.'],
    ['Cinematic Brass', 'Powerful, epic, and swelling brass chords and stabs, perfect for dramatic, blockbuster moments.'],
    ['Glitchy, Staccato Beat', 'A complex, futuristic rhythm with sharp, stuttering, and digital-sounding percussive elements.'],
    ['Cybernetic Rhythms', 'A driving, mechanical, and precise beat with a robotic and high-tech feel.'],
    ['Robotic Percussion', 'Clean, sharp, and synthetic drum hits that sound like they were made by machines.'],
    ['Dystopian Industrial', 'A harsh, noisy, and rhythmic texture with metallic clangs and grinding sounds.'],
    ['Pulsing Sub Bass', 'A deep, powerful, and rhythmic low-frequency bassline that drives the track forward.'],
    ['Warp Drive Hum', 'A low, resonant, and sustained drone that simulates the powerful hum of a starship\'s engine.'],
    ['Laser Blasts', 'Sharp, iconic, and piercing sci-fi sound effects that add punctuating, energetic bursts.'],
    ['Alien Vocal Samples', 'Warped, strange, and otherworldly vocal chops and phrases that add a unique, non-human character.'],
]);

main();