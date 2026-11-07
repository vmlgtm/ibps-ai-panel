import {
  GoogleGenAI,
  Session,
  LiveServerMessage,
  Modality,
  Type,
} from '@google/genai';
import {
  CandidateProfile,
  PanelistConfig,
  PanelSeatId,
  PreInterviewDossier,
  TranscriptEntry,
} from './types';
import { PANELISTS_BY_SEAT, buildPanelistSystemPrompt } from './panelists';
import {
  playJoinChime,
  playHandoffTick,
  playDoneSpeakingPop,
  playToggleClick,
} from './ui-sound';

export type LiveSessionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'listening'
  | 'switching'
  | 'completed'
  | 'error';

export interface PanelBoardControllerCallbacks {
  onStatusChange?: (status: LiveSessionStatus) => void;
  onActiveSeatChange?: (seat: PanelSeatId, panelist: PanelistConfig) => void;
  onAudioLevel?: (speaker: 'panelist' | 'candidate', level: number) => void;
  onTranscriptUpdate?: (
    entries: TranscriptEntry[],
    livePartial?: { speaker: 'panelist' | 'candidate'; text: string }
  ) => void;
  onInterviewComplete?: (closingSummary: string) => void;
  onError?: (error: Error) => void;
}

export interface PanelBoardLiveControllerOptions {
  apiKey?: string;
  model?: string;
  profile: CandidateProfile;
  dossier: PreInterviewDossier;
  initialSeat?: PanelSeatId;
  callbacks?: PanelBoardControllerCallbacks;
}

const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const FALLBACK_MODELS = [
  'gemini-2.0-flash-live-001',
  'gemini-2.0-flash-exp',
  'gemini-3.8-live',
];

/**
 * Resamples Float32 audio samples to 16,000 Hz for Gemini Live audio input.
 */
function resampleTo16k(input: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000) return input;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetInput = 0;

  while (offsetResult < result.length) {
    const nextOffsetInput = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetInput; i < nextOffsetInput && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : input[offsetInput] || 0;
    offsetResult++;
    offsetInput = nextOffsetInput;
  }
  return result;
}

/**
 * Converts Float32 [-1.0, 1.0] samples to 16-bit signed PCM Little-Endian ArrayBuffer.
 */
function floatTo16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/**
 * Converts an ArrayBuffer to a standard base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Decodes 24kHz 16-bit PCM Little-Endian Base64 audio from Gemini Live to Float32 [-1.0, 1.0].
 */
function base64ToFloat32Array(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32Array;
}

/**
 * PanelBoardLiveController
 *
 * Browser-side controller orchestrating the 4-member IBPS interview board over the
 * official Gemini Live API (@google/genai ai.live.connect).
 *
 * Responsibilities:
 * 1. Web Audio Input Pipeline: 16kHz 16-bit PCM base64 streaming + candidate RMS metering.
 * 2. Web Audio Output Pipeline: 24kHz gapless playback scheduling + panelist voice level metering.
 * 3. Barge-In & Interruption: Real-time clearing of queued audio on user interruption.
 * 4. Dual Transcription: Input & output audio transcription streamed to UI transcript entries.
 * 5. Multi-Panelist Sub-Session Handoff: Seamless seat progression (1 -> 2 -> 3 -> 4) with voice switching.
 * 6. Fallback Text Input: Allows candidates to type answers when in quiet environments.
 */
export class PanelBoardLiveController {
  private apiKey: string;
  private customModel?: string;
  private workingModel: string = DEFAULT_LIVE_MODEL;
  private profile: CandidateProfile;
  private dossier: PreInterviewDossier;
  private callbacks: PanelBoardControllerCallbacks;

  // Board State
  private activeSeat: PanelSeatId;
  private status: LiveSessionStatus = 'idle';
  private transcript: TranscriptEntry[] = [];
  private currentPanelistChunkText: string = '';
  private currentCandidateChunkText: string = '';
  private consecutiveLoudFramesWhilePanelistSpeaking: number = 0;
  private finishTurnWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private isMicMuted = false;

  // Live Session
  private aiClient: GoogleGenAI;
  private activeApiVersion: 'v1beta' | 'v1alpha';
  private activeSession: Session | null = null;
  private pendingHandoffSeat: PanelSeatId | null = null;
  private pendingInterviewComplete: string | null = null;
  private handoffTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Audio Pipeline - Mic Input
  private micStream: MediaStream | null = null;
  private micContext: AudioContext | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micProcessor: ScriptProcessorNode | null = null;
  private micMuteGain: GainNode | null = null;

  // Audio Pipeline - Speaker Output
  private playbackContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private scheduledSources: AudioBufferSourceNode[] = [];
  private nextPlayTime: number = 0;
  private meterIntervalId: ReturnType<typeof setInterval> | null = null;
  private smoothedPanelistLevel: number = 0;
  private smoothedCandidateLevel: number = 0;
  private lastCandidateEmitTime: number = 0;

  constructor(options: PanelBoardLiveControllerOptions) {
    const key =
      options.apiKey ||
      (typeof process !== 'undefined'
        ? process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY
        : '') ||
      (typeof window !== 'undefined'
        ? window.localStorage?.getItem('ibps_gemini_api_key') || window.localStorage?.getItem('gemini_api_key') || ''
        : '');

    if (!key) {
      throw new Error(
        'Gemini API key is required to start the Live Interview Board. Please provide an API key in options or set NEXT_PUBLIC_GEMINI_API_KEY.'
      );
    }

    this.apiKey = key.trim();
    this.customModel = options.model;
    this.workingModel = options.model || DEFAULT_LIVE_MODEL;
    this.profile = options.profile;
    this.dossier = options.dossier;
    this.activeSeat = options.initialSeat || 1;
    this.callbacks = options.callbacks || {};

    this.activeApiVersion = this.apiKey.startsWith('auth_tokens/') ? 'v1alpha' : 'v1beta';

    const clientOptions = {
      apiKey: this.apiKey,
      httpOptions: {
        apiVersion: this.activeApiVersion,
      },
    };
    this.aiClient = new GoogleGenAI(clientOptions);
  }

  // ==========================================
  // Public Lifecycle & Control Methods
  // ==========================================

  /**
   * Starts the Live Interview Board by requesting mic access, initializing the audio
   * pipeline, and establishing the Live WebSocket for Seat 1 (Chairman).
   */
  public async start(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('PanelBoardLiveController is destroyed and cannot be reused.');
    }

    try {
      this.setStatus('connecting');

      // 1. Initialize browser audio contexts and mic capture
      await this.initAudioPipeline();

      // 2. Connect to the active seat
      await this.connectToSeat(this.activeSeat);
      playJoinChime();
    } catch (err) {
      this.setStatus('error');
      const error = err instanceof Error ? err : new Error(String(err));
      this.callbacks.onError?.(error);
      throw error;
    }
  }

  /**
   * Disconnects the session, shuts down Web Audio nodes, stops mic tracks, and cleans up.
   */
  public async disconnect(): Promise<void> {
    this.isDestroyed = true;
    this.clearPendingHandoffTimer();
    this.clearFinishTurnWatchdog();

    // Close Gemini Live session
    if (this.activeSession) {
      try {
        this.activeSession.close();
      } catch (err) {
        console.warn('Error closing Gemini Live session:', err);
      }
      this.activeSession = null;
    }

    // Stop playback sources
    this.stopPlaybackQueue();

    // Clear meter intervals
    if (this.meterIntervalId) {
      clearInterval(this.meterIntervalId);
      this.meterIntervalId = null;
    }

    // Cleanup Mic Stream
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    // Cleanup Mic AudioContext
    if (this.micProcessor) {
      this.micProcessor.disconnect();
      this.micProcessor = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.micMuteGain) {
      this.micMuteGain.disconnect();
      this.micMuteGain = null;
    }
    if (this.micContext && this.micContext.state !== 'closed') {
      try {
        await this.micContext.close();
      } catch {}
      this.micContext = null;
    }

    // Cleanup Playback AudioContext
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.playbackContext && this.playbackContext.state !== 'closed') {
      try {
        await this.playbackContext.close();
      } catch {}
      this.playbackContext = null;
    }

    this.callbacks.onAudioLevel?.('panelist', 0);
    this.callbacks.onAudioLevel?.('candidate', 0);
    this.setStatus('idle');
  }

  /**
   * Manually switches or advances the panelist turn (e.g. user clicks "Pass Mic to Next Panelist ->").
   */
  public async manualHandoff(nextSeat?: PanelSeatId): Promise<void> {
    const targetSeat = (nextSeat || (this.activeSeat < 4 ? this.activeSeat + 1 : 1)) as PanelSeatId;
    if (targetSeat === this.activeSeat) return;

    this.stopPlaybackQueue();
    this.clearPendingHandoffTimer();
    this.pendingHandoffSeat = null;

    await this.performHandoff(targetSeat);
  }

  /**
   * Text Input Fallback: Allows candidate to type answers instead of speaking.
   * Sends the text directly into the active Gemini Live session turn.
   */
  public sendCandidateText(text: string): void {
    const cleanText = text.trim();
    if (!cleanText || !this.activeSession) return;

    // Append to transcript
    this.addTranscriptEntry({
      speaker: 'candidate',
      speakerName: this.profile.name,
      text: cleanText,
    });

    // Send client content turn to trigger immediate spoken response
    try {
      this.activeSession.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: cleanText }],
          },
        ],
        turnComplete: true,
      });
    } catch (err) {
      console.warn('Failed to send candidate text via sendClientContent, falling back to sendRealtimeInput:', err);
      try {
        this.activeSession.sendRealtimeInput({
          text: cleanText,
        });
      } catch (fallbackErr) {
        console.error('Failed to send text input to Live session:', fallbackErr);
        this.callbacks.onError?.(
          fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr))
        );
      }
    }
  }

  /**
   * Mute or unmute candidate microphone input.
   */
  public setMicMuted(muted: boolean): void {
    this.isMicMuted = muted;
    playToggleClick(!muted);
    if (muted) {
      this.callbacks.onAudioLevel?.('candidate', 0);
      try {
        this.activeSession?.sendRealtimeInput({ audioStreamEnd: true });
      } catch {}
    }
  }

  /**
   * Manually trigger barge-in/interruption (clears queued panelist audio immediately).
   */
  public interrupt(): void {
    this.handleInterruption();
  }

  /**
   * "Done Speaking / Nudge Panel":
   * When the candidate finishes speaking (or presses Space / clicks Done Speaking),
   * flushes any live candidate transcription and immediately prompts Gemini Live
   * to take the floor and reply without waiting for silence timeouts.
   */
  public finishCandidateTurn(): void {
    if (!this.activeSession || this.isDestroyed) return;

    this.clearFinishTurnWatchdog();
    playDoneSpeakingPop();

    // 1. Capture any accumulated candidate transcription
    const spoken = this.currentCandidateChunkText.trim();
    if (spoken.length > 0) {
      this.addTranscriptEntry({
        speaker: 'candidate',
        speakerName: this.profile.name,
        text: spoken,
      });
      this.currentCandidateChunkText = '';
      this.callbacks.onTranscriptUpdate?.(this.transcript, undefined);
    }

    // 2. Immediately signal Gemini Live to respond now
    try {
      this.activeSession.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: spoken ? '[Candidate finished speaking]' : 'Please proceed.' }],
          },
        ],
        turnComplete: true,
      });
    } catch (err) {
      console.warn('Failed to send finish turn signal via sendClientContent, trying fallback:', err);
      try {
        this.activeSession.sendRealtimeInput({
          text: spoken ? '[Candidate finished speaking]' : 'Please proceed.',
        });
      } catch (fallbackErr) {
        console.warn('Failed to send fallback finish candidate turn text:', fallbackErr);
      }
    }

    // 3. Fallback watchdog: if model audio/turn does not arrive within 1.8 seconds, nudge panelist explicitly
    const initialSourcesCount = this.scheduledSources.length;
    this.finishTurnWatchdogTimer = setTimeout(() => {
      this.finishTurnWatchdogTimer = null;
      if (this.isDestroyed || !this.activeSession) return;

      if (this.scheduledSources.length === initialSourcesCount && !this.currentPanelistChunkText.trim()) {
        console.log('Watchdog: Panelist silent after candidate turn, sending nudge prompt.');
        try {
          this.activeSession.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [
                  {
                    text: '[SYSTEM: Candidate has finished their response. Please respond or ask your next question.]',
                  },
                ],
              },
            ],
            turnComplete: true,
          });
        } catch (watchdogErr) {
          console.warn('Watchdog nudge failed:', watchdogErr);
        }
      }
    }, 1800);
  }

  public isMuted(): boolean {
    return this.isMicMuted;
  }

  public getActiveSeat(): PanelSeatId {
    return this.activeSeat;
  }

  public getStatus(): LiveSessionStatus {
    return this.status;
  }

  public getTranscript(): TranscriptEntry[] {
    return [...this.transcript];
  }

  public getWorkingModel(): string {
    return this.workingModel;
  }

  // ==========================================
  // Audio Pipeline Setup & Processing
  // ==========================================

  private async initAudioPipeline(): Promise<void> {
    if (typeof window === 'undefined') return;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      throw new Error('Web Audio API is not supported in this browser environment.');
    }

    // 1. Playback Context (24kHz native for Gemini Live Audio output)
    this.playbackContext = new AudioContextClass({ sampleRate: 24000 });
    this.analyserNode = this.playbackContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.3;
    this.analyserNode.connect(this.playbackContext.destination);

    // Start panelist RMS level monitoring loop
    this.startPanelistLevelMeter();

    // 2. Microphone Capture
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.micStream = stream;

    // Mic Context
    this.micContext = new AudioContextClass();
    this.micSource = this.micContext.createMediaStreamSource(stream);

    // ScriptProcessor to capture PCM frames
    this.micProcessor = this.micContext.createScriptProcessor(4096, 1, 1);

    // Mute gain node to prevent mic loopback into candidate speakers
    this.micMuteGain = this.micContext.createGain();
    this.micMuteGain.gain.value = 0;

    this.micProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      this.handleMicAudioProcess(event);
    };

    this.micSource.connect(this.micProcessor);
    this.micProcessor.connect(this.micMuteGain);
    this.micMuteGain.connect(this.micContext.destination);
  }

  private handleMicAudioProcess(event: AudioProcessingEvent): void {
    if (this.isDestroyed || this.isMicMuted || !this.activeSession) {
      if (this.smoothedCandidateLevel !== 0) {
        this.smoothedCandidateLevel = 0;
        this.callbacks.onAudioLevel?.('candidate', 0);
      }
      return;
    }

    const inputData = event.inputBuffer.getChannelData(0);
    if (!inputData || inputData.length === 0) return;

    // Calculate RMS audio level for candidate with exponential smoothing and 100ms throttle
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    const candidateLevel = Math.min(1, rms * 4.5);
    this.smoothedCandidateLevel = this.smoothedCandidateLevel * 0.65 + candidateLevel * 0.35;

    const now = Date.now();
    if (now - this.lastCandidateEmitTime >= 100) {
      this.lastCandidateEmitTime = now;
      this.callbacks.onAudioLevel?.('candidate', this.smoothedCandidateLevel);
    }

    // Anti-Noise Half-Duplex Mic Ducking While Panelist Speaks:
    // Solves abrupt silence on coughs, desk taps, breaths, or laptop speaker echo.
    const isPanelistCurrentlyPlaying = this.scheduledSources.length > 0;
    if (isPanelistCurrentlyPlaying) {
      if (rms > 0.25) {
        this.consecutiveLoudFramesWhilePanelistSpeaking++;
      } else {
        this.consecutiveLoudFramesWhilePanelistSpeaking = 0;
      }

      // Unless continuous loud intentional barge-in speech for >= 5 frames (~1.2s), duck mic
      if (this.consecutiveLoudFramesWhilePanelistSpeaking < 5) {
        return;
      }
    } else {
      this.consecutiveLoudFramesWhilePanelistSpeaking = 0;
    }

    // Resample to 16kHz mono and convert to 16-bit PCM little-endian
    const inputSampleRate = this.micContext?.sampleRate || 44100;
    const resampled16k = resampleTo16k(inputData, inputSampleRate);
    const pcm16Buffer = floatTo16BitPCM(resampled16k);
    const base64Audio = arrayBufferToBase64(pcm16Buffer);

    try {
      this.activeSession.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000',
        },
      });
    } catch (err) {
      // In case WebSocket is temporarily closing or switching
      console.warn('Could not send realtime audio chunk:', err);
    }
  }

  private startPanelistLevelMeter(): void {
    if (this.meterIntervalId) clearInterval(this.meterIntervalId);

    // Throttle panelist audio meter emissions to 100ms (10Hz)
    this.meterIntervalId = setInterval(() => {
      if (this.isDestroyed || !this.analyserNode || this.scheduledSources.length === 0) {
        if (this.smoothedPanelistLevel !== 0) {
          this.smoothedPanelistLevel = 0;
          this.callbacks.onAudioLevel?.('panelist', 0);
        }
        return;
      }

      const pcmData = new Uint8Array(this.analyserNode.frequencyBinCount);
      this.analyserNode.getByteTimeDomainData(pcmData);

      let sum = 0;
      for (let i = 0; i < pcmData.length; i++) {
        const x = (pcmData[i] - 128) / 128;
        sum += x * x;
      }
      const rms = Math.sqrt(sum / pcmData.length);
      // Floor at 0.08 while audio buffers are queued/playing so syllable pauses don't dip to 0
      const rawLevel = Math.min(1, Math.max(rms * 4, 0.08));
      this.smoothedPanelistLevel = this.smoothedPanelistLevel * 0.65 + rawLevel * 0.35;
      this.callbacks.onAudioLevel?.('panelist', this.smoothedPanelistLevel);
    }, 100);
  }

  private async queueAudioPlayback(base64Pcm: string): Promise<void> {
    if (!this.playbackContext || !this.analyserNode) return;

    if (this.playbackContext.state === 'suspended') {
      try {
        await this.playbackContext.resume();
      } catch (err) {
        console.warn('Failed to resume playback audio context:', err);
      }
    }

    const float32 = base64ToFloat32Array(base64Pcm);
    if (float32.length === 0) return;

    const audioBuffer = this.playbackContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = this.playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyserNode);

    const now = this.playbackContext.currentTime;
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + 0.02; // 20ms lead for gapless chaining
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
    this.scheduledSources.push(source);

    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) {
        this.scheduledSources.splice(idx, 1);
      }

      if (this.scheduledSources.length === 0) {
        this.smoothedPanelistLevel = 0;
        this.callbacks.onAudioLevel?.('panelist', 0);

        // Check if handoff was scheduled and is waiting for speech to finish
        if (this.pendingHandoffSeat !== null) {
          const target = this.pendingHandoffSeat;
          this.pendingHandoffSeat = null;
          this.performHandoff(target);
        } else if (this.pendingInterviewComplete !== null) {
          const summary = this.pendingInterviewComplete;
          this.pendingInterviewComplete = null;
          this.handleInterviewFinalized(summary);
        }
      }
    };
  }

  private stopPlaybackQueue(): void {
    for (const source of this.scheduledSources) {
      try {
        source.stop();
      } catch {}
    }
    this.scheduledSources = [];
    if (this.playbackContext) {
      this.nextPlayTime = this.playbackContext.currentTime;
    }
    this.smoothedPanelistLevel = 0;
    this.callbacks.onAudioLevel?.('panelist', 0);
  }

  private handleInterruption(): void {
    // Barge-In: candidate spoke over panelist -> immediately clear scheduled audio playback
    this.stopPlaybackQueue();
    this.clearFinishTurnWatchdog();
    this.currentPanelistChunkText = '';
    this.callbacks.onTranscriptUpdate?.(this.transcript, undefined);
  }

  // ==========================================
  // Session Connection & Fallback Negotiation
  // ==========================================

  private async connectToSeat(seat: PanelSeatId): Promise<void> {
    this.activeSeat = seat;
    const panelist = PANELISTS_BY_SEAT[seat];
    this.callbacks.onActiveSeatChange?.(seat, panelist);

    const candidateModels: string[] = [];
    if (this.customModel) {
      candidateModels.push(this.customModel);
    }
    if (!candidateModels.includes(this.workingModel)) {
      candidateModels.push(this.workingModel);
    }
    for (const m of FALLBACK_MODELS) {
      if (!candidateModels.includes(m)) {
        candidateModels.push(m);
      }
    }

    const preferredVersion: 'v1beta' | 'v1alpha' = this.activeApiVersion;
    const secondaryVersion: 'v1beta' | 'v1alpha' =
      preferredVersion === 'v1beta' ? 'v1alpha' : 'v1beta';
    const apiVersions: ('v1beta' | 'v1alpha')[] = [preferredVersion, secondaryVersion];

    let session: Session | null = null;
    let lastError: Error | null = null;

    outerLoop: for (const model of candidateModels) {
      for (const apiVersion of apiVersions) {
        try {
          const client = new GoogleGenAI({
            apiKey: this.apiKey,
            httpOptions: {
              apiVersion,
            },
          });
          session = await this.openLiveSession(client, model, seat, panelist);
          this.workingModel = model;
          this.activeApiVersion = apiVersion;
          this.aiClient = client;
          break outerLoop;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(
            `Connection to Gemini Live with model ${model} (apiVersion: ${apiVersion}) failed on Seat ${seat}, trying fallback:`,
            err
          );
        }
      }
    }

    if (!session) {
      const errorToReport =
        lastError || new Error('Could not establish connection to any Gemini Live model.');
      this.callbacks.onError?.(errorToReport);
      throw errorToReport;
    }

    this.activeSession = session;
    this.setStatus('connected');

    // Send initial kickoff prompt to start conversation for this seat
    this.sendKickstartPrompt(seat, panelist);
  }

  private async openLiveSession(
    client: GoogleGenAI,
    model: string,
    seat: PanelSeatId,
    panelist: PanelistConfig
  ): Promise<Session> {
    const systemPrompt = buildPanelistSystemPrompt(
      seat,
      this.profile,
      this.dossier,
      this.transcript
    );

    let isEstablished = false;

    const session = await client.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: panelist.voiceName,
            },
          },
        },
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: 'hand_over_to_next_panelist',
                description:
                  'Pass the interview turn to the next board member (Seat 1 to 4). Call this when you have completed your quota of questions.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    nextSeat: {
                      type: Type.INTEGER,
                      description: 'The seat number (1, 2, 3, or 4) of the next interviewer.',
                    },
                    briefSummaryOfCandidateSoFar: {
                      type: Type.STRING,
                      description: 'A brief 1-sentence handover note about the candidate.',
                    },
                  },
                  required: ['nextSeat'],
                },
              },
              {
                name: 'complete_interview',
                description:
                  'Formally conclude the 4-member interview panel when all board members have finished their questions.',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    closingRemarkSummary: {
                      type: Type.STRING,
                      description: 'Final summary and closing remarks of the board.',
                    },
                  },
                },
              },
            ],
          },
        ],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => {
          if (!this.isDestroyed) {
            this.setStatus('connected');
          }
        },
        onmessage: (msg: LiveServerMessage) => {
          this.handleLiveServerMessage(msg);
        },
        onerror: (err: unknown) => {
          if (isEstablished && !this.isDestroyed) {
            console.warn(`Gemini Live WebSocket error on Seat ${seat}:`, err);
            this.callbacks.onError?.(
              err instanceof Error ? err : new Error(`Live API error: ${String(err)}`)
            );
          } else if (!isEstablished) {
            console.warn(
              `Live connection error prior to setup completion on Seat ${seat} (model: ${model}):`,
              err
            );
          }
        },
        onclose: (e?: CloseEvent) => {
          if (!isEstablished && e?.reason) {
            console.warn(
              `Live WebSocket closed during setup on Seat ${seat} (model: ${model}, code: ${e.code}): ${e.reason}`
            );
          }
        },
      },
    });

    isEstablished = true;
    return session;
  }

  private sendKickstartPrompt(seat: PanelSeatId, panelist: PanelistConfig): void {
    if (!this.activeSession) return;

    let kickoffMessage = '';
    if (seat === 1) {
      kickoffMessage = `[SYSTEM EVENT: Candidate ${this.profile.name} has entered the interview room and taken a seat. Greet them warmly as Chairman Shri R.K. Deshmukh, put them at ease, and ask your first question regarding their personal profile and graduation background.]`;
    } else {
      const prevPanelist = PANELISTS_BY_SEAT[((seat - 1) as PanelSeatId) || 1];
      kickoffMessage = `[SYSTEM EVENT: ${prevPanelist.name} (Seat ${prevPanelist.seat}) has completed their turn and passed the microphone to you (${panelist.name}, Seat ${seat}). Briefly acknowledge the handover and ask your first targeted question in your focus area.]`;
    }

    try {
      this.activeSession.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text: kickoffMessage }],
          },
        ],
        turnComplete: true,
      });
    } catch (err) {
      console.warn(
        'Failed to send seat kickstart message via sendClientContent, falling back to sendRealtimeInput:',
        err
      );
      try {
        this.activeSession.sendRealtimeInput({
          text: kickoffMessage,
        });
      } catch (fallbackErr) {
        console.warn('Failed to send seat kickstart message:', fallbackErr);
      }
    }
  }

  // ==========================================
  // Live Server Message Processing
  // ==========================================

  private handleLiveServerMessage(msg: LiveServerMessage): void {
    if (this.isDestroyed) return;

    const content = msg.serverContent;
    if (content) {
      // 1. Process Audio Output Chunks
      if (content.modelTurn?.parts) {
        // Clear any waiting finish-turn watchdog since the model has started responding
        this.clearFinishTurnWatchdog();

        // Flush accumulated candidate transcript if model has started replying
        this.flushCandidateTranscript();

        for (const part of content.modelTurn.parts) {
          if (part.inlineData?.data) {
            this.queueAudioPlayback(part.inlineData.data);
          }
          // Fallback text if outputAudioTranscription is absent
          if (part.text && !content.outputTranscription) {
            this.currentPanelistChunkText += part.text;
            this.callbacks.onTranscriptUpdate?.(this.transcript, {
              speaker: 'panelist',
              text: this.currentPanelistChunkText,
            });
          }
        }
      }

      // 2. Interruption Detection (Barge-in)
      if (content.interrupted) {
        this.handleInterruption();
      }

      // 3. Panelist Speech Transcription (Output audio transcription)
      if (content.outputTranscription?.text) {
        this.currentPanelistChunkText += content.outputTranscription.text;
        this.callbacks.onTranscriptUpdate?.(this.transcript, {
          speaker: 'panelist',
          text: this.currentPanelistChunkText,
        });
      }

      // 4. Candidate Speech Transcription (Input audio transcription)
      if (content.interimInputTranscription?.text) {
        const liveText = (this.currentCandidateChunkText + content.interimInputTranscription.text).trim();
        this.callbacks.onTranscriptUpdate?.(this.transcript, {
          speaker: 'candidate',
          text: liveText,
        });
      }

      if (content.inputTranscription?.text) {
        // Accumulate candidate transcription chunks into the full growing sentence
        this.currentCandidateChunkText += content.inputTranscription.text;
        const liveText = this.currentCandidateChunkText.trim();
        if (liveText) {
          this.callbacks.onTranscriptUpdate?.(this.transcript, {
            speaker: 'candidate',
            text: liveText,
          });
        }
      }

      // 5. Turn Complete: finalize utterances in transcript
      if (content.turnComplete) {
        // Finalize candidate speech if pending
        this.flushCandidateTranscript();

        if (this.currentPanelistChunkText.trim()) {
          const panelist = PANELISTS_BY_SEAT[this.activeSeat];
          this.addTranscriptEntry({
            speaker: 'panelist',
            seat: this.activeSeat,
            speakerName: panelist.name,
            text: this.currentPanelistChunkText.trim(),
          });
          this.currentPanelistChunkText = '';
        }
      }
    }

    // 6. Function Tools Execution (Handoff or Completion)
    if (msg.toolCall?.functionCalls) {
      for (const call of msg.toolCall.functionCalls) {
        this.handleToolCall(call);
      }
    }
  }

  private handleToolCall(call: { id?: string; name?: string; args?: unknown }): void {
    const callId = call.id || 'tool-call-1';
    const functionName = call.name;
    const args = (call.args || {}) as Record<string, unknown>;

    if (functionName === 'hand_over_to_next_panelist') {
      const nextSeatNum = Number(args.nextSeat);
      const targetSeat = (
        nextSeatNum >= 1 && nextSeatNum <= 4
          ? nextSeatNum
          : this.activeSeat < 4
          ? this.activeSeat + 1
          : 1
      ) as PanelSeatId;

      // Send tool response to keep Gemini Live protocol satisfied
      try {
        this.activeSession?.sendToolResponse({
          functionResponses: [
            {
              id: callId,
              name: functionName,
              response: {
                output: {
                  status: 'ok',
                  message: `Handoff to Seat ${targetSeat} scheduled.`,
                },
              },
            },
          ],
        });
      } catch (err) {
        console.warn('Failed to send tool response for handoff:', err);
      }

      this.scheduleHandoff(targetSeat);
    } else if (functionName === 'complete_interview') {
      const summary =
        typeof args.closingRemarkSummary === 'string'
          ? args.closingRemarkSummary
          : 'Interview board concluded.';

      try {
        this.activeSession?.sendToolResponse({
          functionResponses: [
            {
              id: callId,
              name: functionName,
              response: {
                output: {
                  status: 'ok',
                  message: 'Interview officially marked complete.',
                },
              },
            },
          ],
        });
      } catch (err) {
        console.warn('Failed to send tool response for complete_interview:', err);
      }

      this.scheduleInterviewCompletion(summary);
    }
  }

  // ==========================================
  // Multi-Panelist Handoff Orchestration
  // ==========================================

  private scheduleHandoff(targetSeat: PanelSeatId): void {
    if (targetSeat === this.activeSeat) return;

    this.clearPendingHandoffTimer();
    this.pendingHandoffSeat = targetSeat;

    // If audio is actively playing, the source.onended listener will execute handoff
    // after the spoken handoff sentence completes.
    // Also set a safety timeout in case onended doesn't fire.
    const remainingAudioDuration =
      this.playbackContext && this.nextPlayTime > this.playbackContext.currentTime
        ? (this.nextPlayTime - this.playbackContext.currentTime) * 1000 + 400
        : 1200;

    this.handoffTimeoutId = setTimeout(() => {
      if (this.pendingHandoffSeat !== null) {
        const next = this.pendingHandoffSeat;
        this.pendingHandoffSeat = null;
        this.performHandoff(next);
      }
    }, Math.max(800, remainingAudioDuration));
  }

  private async performHandoff(targetSeat: PanelSeatId): Promise<void> {
    if (this.isDestroyed) return;

    this.setStatus('switching');
    playHandoffTick();

    // Finalize any candidate speech chunk if pending
    this.flushCandidateTranscript();

    // Finalize any leftover transcription text from previous seat
    if (this.currentPanelistChunkText.trim()) {
      const panelist = PANELISTS_BY_SEAT[this.activeSeat];
      this.addTranscriptEntry({
        speaker: 'panelist',
        seat: this.activeSeat,
        speakerName: panelist.name,
        text: this.currentPanelistChunkText.trim(),
      });
      this.currentPanelistChunkText = '';
    }

    // Add a system announcement to transcript
    const nextPanelist = PANELISTS_BY_SEAT[targetSeat];
    this.addTranscriptEntry({
      speaker: 'system',
      speakerName: 'Board Controller',
      text: `Floor passed to Seat ${targetSeat}: ${nextPanelist.name} (${nextPanelist.roleFocus})`,
    });

    // Close existing WebSocket session cleanly
    if (this.activeSession) {
      try {
        this.activeSession.close();
      } catch {}
      this.activeSession = null;
    }

    // Connect to the new panelist seat
    try {
      await this.connectToSeat(targetSeat);
    } catch (err) {
      this.setStatus('error');
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private scheduleInterviewCompletion(summary: string): void {
    this.clearPendingHandoffTimer();
    this.pendingInterviewComplete = summary;

    const remainingAudioDuration =
      this.playbackContext && this.nextPlayTime > this.playbackContext.currentTime
        ? (this.nextPlayTime - this.playbackContext.currentTime) * 1000 + 400
        : 1200;

    this.handoffTimeoutId = setTimeout(() => {
      if (this.pendingInterviewComplete !== null) {
        const finalSummary = this.pendingInterviewComplete;
        this.pendingInterviewComplete = null;
        this.handleInterviewFinalized(finalSummary);
      }
    }, Math.max(800, remainingAudioDuration));
  }

  private handleInterviewFinalized(summary: string): void {
    if (this.isDestroyed) return;

    this.clearFinishTurnWatchdog();
    this.flushCandidateTranscript();

    if (this.currentPanelistChunkText.trim()) {
      const panelist = PANELISTS_BY_SEAT[this.activeSeat];
      this.addTranscriptEntry({
        speaker: 'panelist',
        seat: this.activeSeat,
        speakerName: panelist.name,
        text: this.currentPanelistChunkText.trim(),
      });
      this.currentPanelistChunkText = '';
    }

    this.addTranscriptEntry({
      speaker: 'system',
      speakerName: 'Board Controller',
      text: `Interview successfully concluded. Generating final evaluation scorecard...`,
    });

    this.setStatus('completed');
    this.callbacks.onInterviewComplete?.(summary);
  }

  private flushCandidateTranscript(): void {
    const text = this.currentCandidateChunkText.trim();
    if (text) {
      this.addTranscriptEntry({
        speaker: 'candidate',
        speakerName: this.profile.name,
        text,
      });
      this.currentCandidateChunkText = '';
    }
  }

  private clearFinishTurnWatchdog(): void {
    if (this.finishTurnWatchdogTimer) {
      clearTimeout(this.finishTurnWatchdogTimer);
      this.finishTurnWatchdogTimer = null;
    }
  }

  private clearPendingHandoffTimer(): void {
    if (this.handoffTimeoutId) {
      clearTimeout(this.handoffTimeoutId);
      this.handoffTimeoutId = null;
    }
  }

  private addTranscriptEntry(entry: Omit<TranscriptEntry, 'id' | 'timestamp'>): void {
    const newEntry: TranscriptEntry = {
      ...entry,
      id: `trn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    this.transcript.push(newEntry);
    this.callbacks.onTranscriptUpdate?.([...this.transcript], undefined);
  }

  private setStatus(status: LiveSessionStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }
}
