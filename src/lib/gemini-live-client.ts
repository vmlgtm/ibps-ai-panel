import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
  StartSensitivity,
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
  'gemini-3.8-live',
  'gemini-3.1-flash-live-preview',
  'gemini-2.0-flash-live-001',
  'gemini-2.0-flash-exp',
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
  private latestInterimCandidateText: string = '';
  private finishTurnWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private hybridVadFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private isMicMuted = false;

  // Turn & Half-Duplex State Machine
  private isAwaitingPanelistResponse = false;
  private isModelGenerating = false;
  private panelistPlaybackEndedAt = 0;
  private hasStreamedCandidateAudioInTurn = false;
  private hasCandidateVoiceActivityInTurn = false;
  private consecutiveShortFillerAutoNudges = 0;
  private pendingAutoContinuationReason: 'auto-filler' | null = null;
  private toolCalledInCurrentTurn = false;
  private isIntentionallyClosing = false;
  private isReconnecting = false;
  private reconnectAttempts = 0;
  private lastTurnSignalSentAt = 0;

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
      this.isAwaitingPanelistResponse = true;

      // 1. Initialize browser audio contexts and mic capture
      await this.initAudioPipeline();

      // 2. Connect to the active seat
      await this.connectToSeat(this.activeSeat);
      playJoinChime();
    } catch (err) {
      this.isAwaitingPanelistResponse = false;
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
    this.isIntentionallyClosing = true;
    this.clearPendingHandoffTimer();
    this.clearFinishTurnWatchdog();
    this.clearHybridVadFallbackTimer();
    this.flushPanelistTranscript();
    this.flushCandidateTranscript();

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
    this.clearFinishTurnWatchdog();
    this.clearHybridVadFallbackTimer();
    this.pendingHandoffSeat = null;
    this.pendingInterviewComplete = null;
    this.pendingAutoContinuationReason = null;
    this.consecutiveShortFillerAutoNudges = 0;
    this.isModelGenerating = false;
    this.isAwaitingPanelistResponse = true;

    await this.performHandoff(targetSeat);
  }

  /**
   * Text Input Fallback: Allows candidate to type answers instead of speaking.
   * Sends the text directly into the active Gemini Live session turn.
   */
  public sendCandidateText(text: string): void {
    const cleanText = text.trim();
    if (!cleanText || !this.activeSession || this.isDestroyed) return;

    this.clearFinishTurnWatchdog();
    this.clearHybridVadFallbackTimer();
    this.currentCandidateChunkText = '';
    this.latestInterimCandidateText = '';
    this.hasCandidateVoiceActivityInTurn = false;
    this.consecutiveShortFillerAutoNudges = 0;
    this.pendingAutoContinuationReason = null;

    // Append to transcript
    this.addTranscriptEntry({
      speaker: 'candidate',
      speakerName: this.profile.name,
      text: cleanText,
    });

    // Gate mic and transition to speaking while panelist responds
    this.isAwaitingPanelistResponse = true;
    this.setStatus('speaking');
    this.sendAudioStreamEndOnce();

    if (!this.sendClientTurnText(cleanText)) {
      this.enterListeningState();
      this.callbacks.onError?.(new Error('Failed to send text input to Live session.'));
      return;
    }

    this.armResponseWatchdog();
  }

  /**
   * Mute or unmute candidate microphone input.
   */
  public setMicMuted(muted: boolean): void {
    this.isMicMuted = muted;
    playToggleClick(!muted);
    if (muted) {
      this.callbacks.onAudioLevel?.('candidate', 0);
      this.sendAudioStreamEndOnce();
    }
  }

  /**
   * Manually trigger barge-in/interruption (clears queued panelist audio immediately).
   */
  public interrupt(): void {
    this.handleInterruption(true);
  }

  /**
   * "Done Speaking / Nudge Panel":
   * When the candidate finishes speaking (or presses Space / clicks Done Speaking),
   * flushes candidate audio with Hybrid VAD (`audioStreamEnd`), gates the mic, and
   * ensures Gemini Live takes the floor without cutting off an active response.
   */
  public finishCandidateTurn(): void {
    if (!this.activeSession || this.isDestroyed) return;

    // Ensure browser audio contexts remain unlocked on user gesture
    if (this.playbackContext?.state === 'suspended') {
      void this.playbackContext.resume().catch(() => {});
    }
    if (this.micContext?.state === 'suspended') {
      void this.micContext.resume().catch(() => {});
    }

    // Do not interrupt a panelist who is already generating or playing audio
    if (this.isModelGenerating || this.scheduledSources.length > 0) {
      return;
    }

    // Debounce accidental double-taps while a turn signal is already in flight
    if (this.isAwaitingPanelistResponse && Date.now() - this.lastTurnSignalSentAt < 1500) {
      return;
    }

    this.lastTurnSignalSentAt = Date.now();
    this.clearFinishTurnWatchdog();
    this.clearHybridVadFallbackTimer();
    playDoneSpeakingPop();

    // 1. Capture any accumulated candidate transcription (including interim text)
    const spoken = (this.currentCandidateChunkText + this.latestInterimCandidateText).trim();
    const candidateSpoke = spoken.length > 0 || this.hasCandidateVoiceActivityInTurn;
    this.flushCandidateTranscript();

    // 2. Gate mic immediately and flush server VAD buffer cleanly
    this.isAwaitingPanelistResponse = true;
    this.hasCandidateVoiceActivityInTurn = false;
    this.pendingAutoContinuationReason = null;
    this.setStatus('speaking');
    this.sendAudioStreamEndOnce();

    // 3. Coordinate Hybrid VAD vs direct continuation
    if (candidateSpoke) {
      // Give automatic/hybrid VAD 1200ms to respond before sending explicit clientContent
      this.hybridVadFallbackTimer = setTimeout(() => {
        this.hybridVadFallbackTimer = null;
        if (
          this.isDestroyed ||
          !this.activeSession ||
          this.isModelGenerating ||
          this.scheduledSources.length > 0 ||
          this.currentPanelistChunkText.trim()
        ) {
          return;
        }
        // Flush any late-arriving transcription chunks from the 1200ms Hybrid VAD window
        const lateSpoken = (
          this.currentCandidateChunkText + this.latestInterimCandidateText
        ).trim();
        this.flushCandidateTranscript();
        const combinedSpoken = lateSpoken || spoken;
        const promptText = combinedSpoken
          ? `[Candidate finished answering: "${combinedSpoken}"]`
          : '[Candidate has finished speaking. Please respond to their answer and ask your next question.]';
        this.sendClientTurnText(promptText);
      }, 1200);
    } else {
      // User pressed the button without speaking (panelist stopped mid-way or stalled)
      this.requestPanelistContinuation('manual-nudge');
    }

    // 4. Recovery watchdog if no model turn arrives within 4.5 seconds
    this.armResponseWatchdog();
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
    this.flushPanelistTranscript();
    this.flushCandidateTranscript();
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
    if (this.playbackContext.state === 'suspended') {
      try {
        await this.playbackContext.resume();
      } catch (err) {
        console.warn('Playback AudioContext resume deferred:', err);
      }
    }
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
    if (this.micContext.state === 'suspended') {
      try {
        await this.micContext.resume();
      } catch (err) {
        console.warn('Mic AudioContext resume deferred:', err);
      }
    }
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
    const isGated =
      this.isDestroyed ||
      this.isMicMuted ||
      !this.activeSession ||
      this.isReconnecting ||
      this.isAwaitingPanelistResponse ||
      this.isModelGenerating ||
      this.scheduledSources.length > 0 ||
      Date.now() - this.panelistPlaybackEndedAt < 400;

    if (isGated) {
      if (this.hasStreamedCandidateAudioInTurn) {
        this.sendAudioStreamEndOnce();
      }
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

    // Resample to 16kHz mono and convert to 16-bit PCM little-endian
    const inputSampleRate = this.micContext?.sampleRate || 44100;
    const resampled16k = resampleTo16k(inputData, inputSampleRate);
    const pcm16Buffer = floatTo16BitPCM(resampled16k);
    const base64Audio = arrayBufferToBase64(pcm16Buffer);

    try {
      this.activeSession?.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType: 'audio/pcm;rate=16000',
        },
      });
      this.hasStreamedCandidateAudioInTurn = true;
      if (rms > 0.035) {
        this.hasCandidateVoiceActivityInTurn = true;
      }
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

  private queueAudioPlayback(base64Pcm: string): void {
    if (!this.playbackContext || !this.analyserNode) return;

    if (this.playbackContext.state === 'suspended') {
      this.playbackContext.resume().catch((err) => {
        console.warn('Failed to resume playback audio context:', err);
      });
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

    // Keep handoff / completion safety timer extended past newly scheduled trailing chunks
    if (this.pendingHandoffSeat !== null) {
      this.refreshPendingHandoffTimer('handoff');
    } else if (this.pendingInterviewComplete !== null) {
      this.refreshPendingHandoffTimer('complete');
    }

    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) {
        this.scheduledSources.splice(idx, 1);
      }

      if (this.scheduledSources.length === 0) {
        this.smoothedPanelistLevel = 0;
        this.callbacks.onAudioLevel?.('panelist', 0);

        if (!this.isModelGenerating) {
          this.onPanelistTurnPlaybackFinished();
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

  private handleInterruption(userInitiated: boolean): void {
    this.stopPlaybackQueue();
    this.clearFinishTurnWatchdog();
    this.clearHybridVadFallbackTimer();

    const partialPanelist = this.currentPanelistChunkText.trim();
    if (partialPanelist) {
      const panelist = PANELISTS_BY_SEAT[this.activeSeat];
      this.addTranscriptEntry({
        speaker: 'panelist',
        seat: this.activeSeat,
        speakerName: panelist.name,
        text: userInitiated ? `${partialPanelist} (interrupted)` : partialPanelist,
      });
      this.currentPanelistChunkText = '';
    }

    this.pendingAutoContinuationReason = null;
    this.consecutiveShortFillerAutoNudges = 0;
    this.toolCalledInCurrentTurn = false;
    this.isModelGenerating = false;
    this.isAwaitingPanelistResponse = false;
    this.panelistPlaybackEndedAt = userInitiated ? 0 : Date.now();
    this.hasStreamedCandidateAudioInTurn = false;
    this.hasCandidateVoiceActivityInTurn = false;
    this.callbacks.onTranscriptUpdate?.([...this.transcript], undefined);

    if (!this.isDestroyed && this.status !== 'switching' && this.status !== 'completed') {
      this.setStatus('listening');
    }
  }

  // ==========================================
  // Session Connection & Fallback Negotiation
  // ==========================================

  private async connectToSeat(seat: PanelSeatId): Promise<void> {
    this.activeSeat = seat;
    const panelist = PANELISTS_BY_SEAT[seat];
    const isResume = this.transcript.some(
      (entry) => entry.speaker === 'panelist' && entry.seat === seat
    );
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
        const client = new GoogleGenAI({
          apiKey: this.apiKey,
          httpOptions: {
            apiVersion,
          },
        });
        try {
          session = await this.openLiveSession(client, model, seat, panelist, true);
          this.workingModel = model;
          this.activeApiVersion = apiVersion;
          this.aiClient = client;
          break outerLoop;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(
            `Connection to Gemini Live with model ${model} (apiVersion: ${apiVersion}) failed on Seat ${seat}:`,
            err
          );

          // If a legacy fallback model rejects realtimeInputConfig, retry once without it
          if (!this.isDestroyed && !/api key|unauthorized|forbidden|permission denied/i.test(lastError.message)) {
            try {
              session = await this.openLiveSession(client, model, seat, panelist, false);
              this.workingModel = model;
              this.activeApiVersion = apiVersion;
              this.aiClient = client;
              break outerLoop;
            } catch (retryErr) {
              lastError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
              console.warn(
                `Fallback connection without realtimeInputConfig for ${model} (apiVersion: ${apiVersion}) also failed:`,
                retryErr
              );
            }
          }
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
    this.isIntentionallyClosing = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.setStatus('connected');

    // Send initial kickoff prompt to start or resume conversation for this seat
    this.sendKickstartPrompt(seat, panelist, isResume);
  }

  private async openLiveSession(
    client: GoogleGenAI,
    model: string,
    seat: PanelSeatId,
    panelist: PanelistConfig,
    includeRealtimeInputConfig: boolean
  ): Promise<Session> {
    const systemPrompt = buildPanelistSystemPrompt(
      seat,
      this.profile,
      this.dossier,
      this.transcript
    );

    let isEstablished = false;

    const config: Parameters<GoogleGenAI['live']['connect']>[0]['config'] = {
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
    };

    if (includeRealtimeInputConfig) {
      config.realtimeInputConfig = {
        activityHandling: ActivityHandling.NO_INTERRUPTION,
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
          prefixPaddingMs: 300,
          silenceDurationMs: 1800,
        },
      };
    }

    const session = await client.live.connect({
      model,
      config,
      callbacks: {
        onopen: () => {
          // Wait until connect() resolves setupComplete before marking session active
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
          } else if (isEstablished && !this.isDestroyed && !this.isIntentionallyClosing) {
            console.warn(
              `Live WebSocket closed unexpectedly on Seat ${seat} (code: ${e?.code}, reason: ${e?.reason || 'unknown'}). Attempting recovery...`
            );
            void this.handleUnexpectedDisconnect(seat);
          }
        },
      },
    });

    isEstablished = true;
    return session;
  }

  private sendKickstartPrompt(
    seat: PanelSeatId,
    panelist: PanelistConfig,
    isResume: boolean
  ): void {
    if (!this.activeSession) return;

    let kickoffMessage = '';
    if (isResume) {
      kickoffMessage = `[SYSTEM EVENT: Brief connection refresh completed for ${panelist.name} (Seat ${seat}). Continue the interview smoothly from the recent conversation context without repeating already-asked questions. State your next complete question or follow-up now. Speak with an authentic Indian English accent (never an American accent).]`;
    } else if (seat === 1) {
      kickoffMessage = `[SYSTEM EVENT: Candidate ${this.profile.name} has entered the interview room and taken a seat. Greet them warmly as Chairman Shri R.K. Deshmukh, put them at ease, and ask your first question regarding their personal profile and graduation background. Speak with an authentic Indian English accent (never an American accent).]`;
    } else {
      const prevPanelist = PANELISTS_BY_SEAT[((seat - 1) as PanelSeatId) || 1];
      kickoffMessage = `[SYSTEM EVENT: ${prevPanelist.name} (Seat ${prevPanelist.seat}) has completed their turn and passed the microphone to you (${panelist.name}, Seat ${seat}). Briefly acknowledge the handover and ask your first targeted question in your focus area. Speak with an authentic Indian English accent (never an American accent).]`;
    }

    this.isAwaitingPanelistResponse = true;
    this.isModelGenerating = false;
    this.consecutiveShortFillerAutoNudges = 0;
    this.pendingAutoContinuationReason = null;
    this.setStatus('speaking');

    this.sendClientTurnText(kickoffMessage);
    this.armResponseWatchdog();
  }

  // ==========================================
  // Live Server Message Processing
  // ==========================================

  private handleLiveServerMessage(msg: LiveServerMessage): void {
    if (this.isDestroyed) return;

    if (msg.goAway) {
      console.warn('Gemini Live GoAway received, remaining time:', msg.goAway.timeLeft);
    }

    // Process tool calls before turnComplete so handoff/completion state is known
    if (msg.toolCall?.functionCalls) {
      this.toolCalledInCurrentTurn = true;
      for (const call of msg.toolCall.functionCalls) {
        this.handleToolCall(call);
      }
    }

    const content = msg.serverContent;
    if (content) {
      // 1. Process Audio Output Chunks
      if (content.modelTurn?.parts) {
        this.clearFinishTurnWatchdog();
        this.clearHybridVadFallbackTimer();
        this.isModelGenerating = true;
        this.isAwaitingPanelistResponse = true;
        if (this.status !== 'speaking' && this.status !== 'switching') {
          this.setStatus('speaking');
        }

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

      // 2. Interruption Detection (only expected on legacy fallback models if NO_INTERRUPTION is unsupported)
      if (content.interrupted) {
        this.handleInterruption(false);
        return;
      }

      // 3. Panelist Speech Transcription (Output audio transcription)
      if (content.outputTranscription?.text) {
        this.clearFinishTurnWatchdog();
        this.clearHybridVadFallbackTimer();
        this.isModelGenerating = true;
        this.isAwaitingPanelistResponse = true;
        if (this.status !== 'speaking' && this.status !== 'switching') {
          this.setStatus('speaking');
        }
        this.currentPanelistChunkText += content.outputTranscription.text;
        this.callbacks.onTranscriptUpdate?.(this.transcript, {
          speaker: 'panelist',
          text: this.currentPanelistChunkText,
        });
      }

      // 4. Candidate Speech Transcription (Input audio transcription)
      if (content.interimInputTranscription?.text) {
        this.latestInterimCandidateText = content.interimInputTranscription.text;
        const liveText = (this.currentCandidateChunkText + this.latestInterimCandidateText).trim();
        this.callbacks.onTranscriptUpdate?.(this.transcript, {
          speaker: 'candidate',
          text: liveText,
        });
      }

      if (content.inputTranscription?.text) {
        // Accumulate candidate transcription chunks into the full growing sentence
        this.currentCandidateChunkText += content.inputTranscription.text;
        this.latestInterimCandidateText = '';
        const liveText = this.currentCandidateChunkText.trim();
        if (liveText) {
          this.callbacks.onTranscriptUpdate?.(this.transcript, {
            speaker: 'candidate',
            text: liveText,
          });
        }
      }

      // 5. Turn Complete: finalize utterances and coordinate turn state
      if (content.turnComplete) {
        this.isModelGenerating = false;
        this.clearFinishTurnWatchdog();
        this.clearHybridVadFallbackTimer();

        // Finalize candidate speech if pending
        this.flushCandidateTranscript();

        const completedPanelistText = this.currentPanelistChunkText.trim();
        if (completedPanelistText) {
          const panelist = PANELISTS_BY_SEAT[this.activeSeat];
          this.addTranscriptEntry({
            speaker: 'panelist',
            seat: this.activeSeat,
            speakerName: panelist.name,
            text: completedPanelistText,
          });
          this.currentPanelistChunkText = '';
        }

        const isPendingTransition =
          this.pendingHandoffSeat !== null || this.pendingInterviewComplete !== null;

        if (
          !isPendingTransition &&
          !this.toolCalledInCurrentTurn &&
          this.isFillerOnlyTurn(completedPanelistText) &&
          this.consecutiveShortFillerAutoNudges < 2
        ) {
          this.consecutiveShortFillerAutoNudges++;
          this.pendingAutoContinuationReason = 'auto-filler';
          this.isAwaitingPanelistResponse = true;
        } else {
          this.consecutiveShortFillerAutoNudges = 0;
          this.pendingAutoContinuationReason = null;
        }

        this.toolCalledInCurrentTurn = false;

        if (this.scheduledSources.length === 0) {
          this.onPanelistTurnPlaybackFinished();
        }
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
  // Multi-Panelist Handoff & Turn Helpers
  // ==========================================

  private onPanelistTurnPlaybackFinished(): void {
    if (this.isDestroyed) return;

    if (this.pendingHandoffSeat !== null) {
      const target = this.pendingHandoffSeat;
      this.pendingHandoffSeat = null;
      this.clearPendingHandoffTimer();
      void this.performHandoff(target);
      return;
    }

    if (this.pendingInterviewComplete !== null) {
      const summary = this.pendingInterviewComplete;
      this.pendingInterviewComplete = null;
      this.clearPendingHandoffTimer();
      this.handleInterviewFinalized(summary);
      return;
    }

    if (this.pendingAutoContinuationReason === 'auto-filler') {
      this.pendingAutoContinuationReason = null;
      this.requestPanelistContinuation('auto-filler');
      this.armResponseWatchdog();
      return;
    }

    this.enterListeningState();
  }

  private enterListeningState(): void {
    this.isAwaitingPanelistResponse = false;
    this.isModelGenerating = false;
    this.toolCalledInCurrentTurn = false;
    this.panelistPlaybackEndedAt = Date.now();
    this.hasStreamedCandidateAudioInTurn = false;
    this.hasCandidateVoiceActivityInTurn = false;
    if (
      !this.isDestroyed &&
      this.status !== 'switching' &&
      this.status !== 'completed' &&
      this.status !== 'error'
    ) {
      this.setStatus('listening');
    }
  }

  private isFillerOnlyTurn(text: string): boolean {
    const clean = text.trim();
    if (!clean) return true;
    if (clean.includes('?') || clean.length > 50) return false;

    if (
      /^(i see|right|okay|ok|very well|achha|accha|hmm+|yes|uh-huh|sure|alright|go on|go ahead|please continue|thank you|thanks|noted|good|fine|carry on|continue)[.!,\s]*$/i.test(
        clean
      )
    ) {
      return true;
    }

    const words = clean.replace(/[.!,;:]+$/g, '').split(/\s+/).filter(Boolean);
    return words.length <= 3;
  }

  private requestPanelistContinuation(reason: 'auto-filler' | 'manual-nudge' | 'watchdog'): void {
    if (this.isDestroyed || !this.activeSession) return;

    this.isAwaitingPanelistResponse = true;
    if (this.status !== 'speaking' && this.status !== 'switching') {
      this.setStatus('speaking');
    }

    const promptText =
      reason === 'auto-filler'
        ? '[SYSTEM: Your previous turn was only a brief acknowledgment without a complete question. Immediately continue speaking and ask your complete interview question (or call the handoff tool if your quota is done). Speak with an authentic Indian English accent (never an American accent).]'
        : '[SYSTEM: Please continue and state your complete interview question clearly to the candidate now. Speak with an authentic Indian English accent (never an American accent).]';

    this.sendClientTurnText(promptText);
  }

  private armResponseWatchdog(): void {
    this.clearFinishTurnWatchdog();
    this.finishTurnWatchdogTimer = setTimeout(() => {
      this.finishTurnWatchdogTimer = null;
      if (this.isDestroyed || this.isReconnecting) return;

      if (!this.activeSession) {
        void this.handleUnexpectedDisconnect(this.activeSeat);
        return;
      }

      if (
        !this.isModelGenerating &&
        this.scheduledSources.length === 0 &&
        !this.currentPanelistChunkText.trim()
      ) {
        console.log('Watchdog: Panelist silent after prompt, sending recovery nudge.');
        const sent = this.sendClientTurnText(
          '[SYSTEM: The candidate is waiting. Please respond and state your next interview question clearly now.]'
        );
        if (!sent) {
          void this.handleUnexpectedDisconnect(this.activeSeat);
        }
      }
    }, 4500);
  }

  private sendClientTurnText(text: string): boolean {
    if (!this.activeSession || this.isDestroyed) return false;
    this.lastTurnSignalSentAt = Date.now();

    try {
      this.activeSession.sendClientContent({
        turns: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        turnComplete: true,
      });
      return true;
    } catch (err) {
      console.warn(
        'Failed to send turn text via sendClientContent, falling back to sendRealtimeInput:',
        err
      );
      try {
        this.activeSession.sendRealtimeInput({ text });
        return true;
      } catch (fallbackErr) {
        console.warn('Failed to send fallback turn text:', fallbackErr);
        return false;
      }
    }
  }

  private sendAudioStreamEndOnce(): void {
    if (!this.hasStreamedCandidateAudioInTurn) return;
    this.hasStreamedCandidateAudioInTurn = false;
    try {
      this.activeSession?.sendRealtimeInput({ audioStreamEnd: true });
    } catch {}
  }

  private async handleUnexpectedDisconnect(seat: PanelSeatId): Promise<void> {
    if (this.isDestroyed || this.isIntentionallyClosing || this.isReconnecting) return;

    if (this.reconnectAttempts >= 2) {
      this.isAwaitingPanelistResponse = false;
      this.isModelGenerating = false;
      this.setStatus('error');
      this.callbacks.onError?.(
        new Error('Live session disconnected unexpectedly. Please click Join & Start Interview to reconnect.')
      );
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    this.clearFinishTurnWatchdog();
    this.clearHybridVadFallbackTimer();
    this.clearPendingHandoffTimer();
    this.stopPlaybackQueue();

    this.flushCandidateTranscript();
    this.flushPanelistTranscript();

    this.activeSession = null;
    this.isModelGenerating = false;
    this.isAwaitingPanelistResponse = true;
    this.setStatus('connecting');

    try {
      await this.connectToSeat(seat);
    } catch (err) {
      this.isReconnecting = false;
      this.isAwaitingPanelistResponse = false;
      this.setStatus('error');
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private refreshPendingHandoffTimer(kind: 'handoff' | 'complete'): void {
    this.clearPendingHandoffTimer();
    const remainingAudioDuration =
      this.playbackContext && this.nextPlayTime > this.playbackContext.currentTime
        ? (this.nextPlayTime - this.playbackContext.currentTime) * 1000 + 500
        : 1200;

    this.handoffTimeoutId = setTimeout(() => {
      if (kind === 'handoff' && this.pendingHandoffSeat !== null) {
        const next = this.pendingHandoffSeat;
        this.pendingHandoffSeat = null;
        void this.performHandoff(next);
      } else if (kind === 'complete' && this.pendingInterviewComplete !== null) {
        const finalSummary = this.pendingInterviewComplete;
        this.pendingInterviewComplete = null;
        this.handleInterviewFinalized(finalSummary);
      }
    }, Math.max(800, remainingAudioDuration));
  }

  private scheduleHandoff(targetSeat: PanelSeatId): void {
    if (targetSeat === this.activeSeat) return;

    this.pendingHandoffSeat = targetSeat;
    this.refreshPendingHandoffTimer('handoff');
  }

  private async performHandoff(targetSeat: PanelSeatId): Promise<void> {
    if (this.isDestroyed) return;

    this.clearFinishTurnWatchdog();
    this.clearHybridVadFallbackTimer();
    this.clearPendingHandoffTimer();
    this.pendingAutoContinuationReason = null;
    this.consecutiveShortFillerAutoNudges = 0;
    this.isModelGenerating = false;
    this.isAwaitingPanelistResponse = true;
    this.setStatus('switching');
    playHandoffTick();

    // Finalize any candidate or panelist speech chunk if pending
    this.flushCandidateTranscript();
    this.flushPanelistTranscript();

    // Add a system announcement to transcript
    const nextPanelist = PANELISTS_BY_SEAT[targetSeat];
    this.addTranscriptEntry({
      speaker: 'system',
      speakerName: 'Board Controller',
      text: `Floor passed to Seat ${targetSeat}: ${nextPanelist.name} (${nextPanelist.roleFocus})`,
    });

    // Close existing WebSocket session cleanly without triggering unexpected-disconnect recovery
    if (this.activeSession) {
      this.isIntentionallyClosing = true;
      try {
        this.activeSession.close();
      } catch {}
      this.activeSession = null;
    }

    // Connect to the new panelist seat
    try {
      await this.connectToSeat(targetSeat);
    } catch (err) {
      this.isAwaitingPanelistResponse = false;
      this.setStatus('error');
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private scheduleInterviewCompletion(summary: string): void {
    this.pendingInterviewComplete = summary;
    this.refreshPendingHandoffTimer('complete');
  }

  private handleInterviewFinalized(summary: string): void {
    if (this.isDestroyed) return;

    this.clearFinishTurnWatchdog();
    this.clearHybridVadFallbackTimer();
    this.flushCandidateTranscript();
    this.flushPanelistTranscript();

    this.addTranscriptEntry({
      speaker: 'system',
      speakerName: 'Board Controller',
      text: `Interview successfully concluded. Generating final evaluation scorecard...`,
    });

    this.isAwaitingPanelistResponse = false;
    this.isModelGenerating = false;
    this.setStatus('completed');
    this.callbacks.onInterviewComplete?.(summary);
  }

  private flushPanelistTranscript(): void {
    const text = this.currentPanelistChunkText.trim();
    if (text) {
      const panelist = PANELISTS_BY_SEAT[this.activeSeat];
      this.addTranscriptEntry({
        speaker: 'panelist',
        seat: this.activeSeat,
        speakerName: panelist.name,
        text,
      });
      this.currentPanelistChunkText = '';
    }
  }

  private flushCandidateTranscript(): void {
    const text = (this.currentCandidateChunkText + this.latestInterimCandidateText).trim();
    if (text) {
      this.addTranscriptEntry({
        speaker: 'candidate',
        speakerName: this.profile.name,
        text,
      });
    }
    this.currentCandidateChunkText = '';
    this.latestInterimCandidateText = '';
  }

  private clearFinishTurnWatchdog(): void {
    if (this.finishTurnWatchdogTimer) {
      clearTimeout(this.finishTurnWatchdogTimer);
      this.finishTurnWatchdogTimer = null;
    }
  }

  private clearHybridVadFallbackTimer(): void {
    if (this.hybridVadFallbackTimer) {
      clearTimeout(this.hybridVadFallbackTimer);
      this.hybridVadFallbackTimer = null;
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
