'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CandidateProfile,
  PanelSeatId,
  PreInterviewDossier,
  TranscriptEntry,
} from '@/lib/types';
import { PANELISTS, PANELISTS_BY_SEAT } from '@/lib/panelists';
import { SAMPLE_PROFILES, RBI_FACTSHEET_SUMMARY } from '@/lib/rbi-factsheet';
import {
  LiveSessionStatus,
  PanelBoardLiveController,
} from '@/lib/gemini-live-client';
import { PanelistCard } from '@/components/PanelistCard';
import { WebcamMirror } from '@/components/WebcamMirror';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Subtitles,
  Hand,
  SkipForward,
  PhoneOff,
  Play,
  MessageSquare,
  FileText,
  X,
  Send,
  Sparkles,
  AlertCircle,
  Layout,
  LayoutGrid,
  Check,
} from 'lucide-react';

const DEFAULT_DOSSIER: PreInterviewDossier = {
  hometownFacts: [
    'Major commercial and agricultural trading center in the region',
    'High density of Regional Rural Bank (RRB) and Lead Bank offices',
    'Known for traditional handicraft artisans eligible for PM Vishwakarma scheme',
  ],
  degreeCrossQuestions: [
    'How does your educational background help modernize banking operations?',
    'With core banking and digital payments scaling, how will you bridge customer security with service?',
  ],
  currentBankingTopics: [
    'RBI 2026 Monetary Policy: Repo rate at 6.50% & SDF 6.25%',
    'Priority Sector Lending (PSL) sub-targets for small & marginal farmers',
    'Asset quality management: SMA-0/1/2 triggers and SARFAESI 2002 recovery',
  ],
  rbiQuickRef: RBI_FACTSHEET_SUMMARY,
};

const DEMO_RESPONSES: Record<PanelSeatId, string> = {
  1: 'Thank you, respected Chairman Sir. Having completed my graduation, I am eager to join public sector banking because it combines nationwide career leadership with direct grassroots financial inclusion. My academic training in structured problem solving makes me well suited for probationary officer responsibilities.',
  2: 'Sir, the Reserve Bank of India currently maintains the Policy Repo Rate at 6.50%, the Standing Deposit Facility (SDF) at 6.25%, and the Cash Reserve Ratio at 4.50%. When the repo rate is adjusted, it transmits through bank MCLR and EBLR benchmarks, balancing growth with inflation moderation. Regarding NPAs, accounts overdue past 90 days enter sub-standard categorization.',
  3: 'Respected Professor, my academic degree gives me deep appreciation for quantitative modeling and operational efficiency. In banking, these principles directly apply to core reconciliation, risk scoring, and credit appraisal. Furthermore, rural capex investments have a 2.5x multiplier on priority sector credit off-take.',
  4: 'Sir, agar branch mein koi kisan bhai ya senior citizen pareshaan aate hain, pehle main unhe aadar se baithaunga aur unki baat dhyan se sununga. KCC subsidy ya DBT issue ko priority par resolve karna aur regional bhasha mein connect karna hi ek sacche bank officer ka kartavya hai.',
};

export default function BoardroomPage() {
  const router = useRouter();

  // Profile & Dossier State
  const [profile, setProfile] = useState<CandidateProfile>(SAMPLE_PROFILES[0]);
  const [dossier, setDossier] = useState<PreInterviewDossier>(DEFAULT_DOSSIER);

  // Live Interview Board State
  const [controller, setController] = useState<PanelBoardLiveController | null>(null);
  const [status, setStatus] = useState<LiveSessionStatus>('idle');
  const [activeSeat, setActiveSeat] = useState<PanelSeatId>(1);
  const [panelistSpeaking, setPanelistSpeaking] = useState<boolean>(false);
  const panelistSpeakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panelistAudioLevel, setPanelistAudioLevel] = useState<number>(0);
  const [candidateAudioLevel, setCandidateAudioLevel] = useState<number>(0);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isCameraOn, setIsCameraOn] = useState<boolean>(true);
  const [showCaptions, setShowCaptions] = useState<boolean>(true);
  const [layoutMode, setLayoutMode] = useState<'spotlight' | 'grid'>('spotlight');

  // Drawer state: null, 'chat', or 'dossier'
  const [activeDrawer, setActiveDrawer] = useState<'chat' | 'dossier' | null>(null);

  // Transcript & Subtitles
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [livePartial, setLivePartial] = useState<{
    speaker: 'panelist' | 'candidate';
    text: string;
  } | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Fallback text input
  const [typedAnswer, setTypedAnswer] = useState<string>('');

  // Webcam Posture Snapshots
  const [webcamSnapshots, setWebcamSnapshots] = useState<string[]>([]);

  // Session Timer
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Error Banner
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // UI Delight states: Done Speaking feedback & Baton Handoff Toast
  const [doneSpeakingFlash, setDoneSpeakingFlash] = useState<boolean>(false);
  const [handoffBanner, setHandoffBanner] = useState<{
    fromName: string;
    toName: string;
    toTitle: string;
  } | null>(null);
  const activeSeatRef = useRef<PanelSeatId>(1);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeSeatRef.current = activeSeat;
  }, [activeSeat]);

  // 1. Initialize from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storedProfile = sessionStorage.getItem('ibps_candidate_profile');
      if (storedProfile) {
        const parsed = JSON.parse(storedProfile);
        queueMicrotask(() => {
          setProfile(parsed);
        });
      }
      const storedDossier = sessionStorage.getItem('ibps_dossier');
      if (storedDossier) {
        const parsed = JSON.parse(storedDossier);
        queueMicrotask(() => {
          setDossier(parsed);
        });
      }
    } catch (err) {
      console.warn('Error reading sessionStorage data:', err);
    }
  }, []);

  // 2. Timer management
  useEffect(() => {
    if (status !== 'idle' && status !== 'completed' && status !== 'error') {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setSessionSeconds((sec) => sec + 1);
        }, 1000);
      }
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status]);

  // 3. Auto-scroll transcript feed
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, livePartial, activeDrawer]);

  // Format MM:SS
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // 4. Start / Connect Live Interview Board
  const startInterview = async () => {
    setErrorMessage(null);
    setStatus('connecting');

    try {
      const customKey =
        typeof window !== 'undefined'
          ? localStorage.getItem('ibps_gemini_api_key') ||
            localStorage.getItem('gemini_api_key') ||
            ''
          : '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (customKey) {
        headers['x-gemini-api-key'] = customKey;
      }

      const res = await fetch('/api/token', {
        method: 'POST',
        headers,
      });

      let token: string | undefined = undefined;
      let discoveredModel: string | undefined = undefined;

      if (res.ok) {
        const tokenData = await res.json();
        token = tokenData.token;
        discoveredModel = tokenData.model;
      } else {
        const errJson = await res.json().catch(() => ({}));
        if (customKey) {
          token = customKey;
        } else {
          throw new Error(
            errJson.error ||
              'Unable to obtain Gemini Live session token. Please ensure GEMINI_API_KEY is configured or enter your API key.'
          );
        }
      }

      const ctrl = new PanelBoardLiveController({
        apiKey: token,
        model: discoveredModel,
        profile,
        dossier,
        initialSeat: 1,
        callbacks: {
          onStatusChange: (newStatus) => {
            setStatus(newStatus);
            if (newStatus === 'connected') {
              import('@/lib/ui-sound')
                .then((m) => m.playJoinChime?.())
                .catch(() => {});
            }
          },
          onActiveSeatChange: (seat) => {
            const prevSeat = activeSeatRef.current;
            if (prevSeat !== seat) {
              const fromName = PANELISTS_BY_SEAT[prevSeat]?.name || `Seat ${prevSeat}`;
              const nextPanelist = PANELISTS_BY_SEAT[seat] || PANELISTS[0];
              setHandoffBanner({
                fromName,
                toName: nextPanelist.name,
                toTitle: nextPanelist.title,
              });
              if (handoffTimerRef.current) {
                clearTimeout(handoffTimerRef.current);
              }
              handoffTimerRef.current = setTimeout(() => {
                setHandoffBanner(null);
              }, 3200);

              import('@/lib/ui-sound')
                .then((m) => (m as any).playHandoffTick?.())
                .catch(() => {});
            }
            if (panelistSpeakingTimerRef.current) {
              clearTimeout(panelistSpeakingTimerRef.current);
              panelistSpeakingTimerRef.current = null;
            }
            setPanelistSpeaking(false);
            setPanelistAudioLevel(0);
            setActiveSeat(seat);
            activeSeatRef.current = seat;
            setLivePartial(null);
          },
          onAudioLevel: (speaker, level) => {
            if (speaker === 'panelist') {
              setPanelistAudioLevel(level);
              if (level > 0.04) {
                if (panelistSpeakingTimerRef.current) {
                  clearTimeout(panelistSpeakingTimerRef.current);
                  panelistSpeakingTimerRef.current = null;
                }
                setPanelistSpeaking(true);
              } else {
                if (!panelistSpeakingTimerRef.current) {
                  panelistSpeakingTimerRef.current = setTimeout(() => {
                    setPanelistSpeaking(false);
                    panelistSpeakingTimerRef.current = null;
                  }, 650);
                }
              }
            } else {
              setCandidateAudioLevel(level);
            }
          },
          onTranscriptUpdate: (entries, partial) => {
            setTranscript([...entries]);
            setLivePartial(partial || null);
          },
          onInterviewComplete: () => {
            endInterview();
          },
          onError: (err) => {
            console.error('Gemini Live Board Error:', err);
            setErrorMessage(err.message || 'Error occurred during live interview turn.');
          },
        },
      });

      setController(ctrl);
      await ctrl.start();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Failed to start interview:', error);
      setStatus('error');
      setErrorMessage(error.message);
    }
  };

  // 5. Mic Toggle
  const toggleMic = () => {
    if (!controller) return;
    const nextMuted = !isMicMuted;
    controller.setMicMuted(nextMuted);
    setIsMicMuted(nextMuted);
  };

  // 6. Manual Handoff to Next Member
  const handlePassMic = (targetSeat?: PanelSeatId) => {
    if (!controller) return;
    controller.manualHandoff(targetSeat);
  };

  // 7. Interruption / Barge-In
  const handleBargeIn = () => {
    if (!controller) return;
    controller.interrupt();
    setPanelistSpeaking(false);
  };

  // 8. Fallback text input send
  const handleSendText = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!controller || !typedAnswer.trim()) return;
    controller.sendCandidateText(typedAnswer.trim());
    setTypedAnswer('');
  };

  // 9. Simulate Demo Answer helper
  const handleSimulateDemo = () => {
    if (!controller) return;
    const sample = DEMO_RESPONSES[activeSeat] || DEMO_RESPONSES[1];
    controller.sendCandidateText(sample);
  };

  // 10. End & Generate Scorecard
  const endInterview = useCallback(async () => {
    let finalTranscript = transcript;
    if (controller) {
      finalTranscript = controller.getTranscript();
      await controller.disconnect();
      setController(null);
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('ibps_transcript', JSON.stringify(finalTranscript));
      sessionStorage.setItem('ibps_webcam_snapshots', JSON.stringify(webcamSnapshots));
      sessionStorage.setItem('ibps_candidate_profile', JSON.stringify(profile));
    }

    router.push('/report');
  }, [controller, transcript, webcamSnapshots, profile, router]);

  const activePanelist = PANELISTS_BY_SEAT[activeSeat] || PANELISTS[0];
  const otherPanelists = PANELISTS.filter((p) => p.seat !== activeSeat);
  const isCallLive =
    status === 'connected' ||
    status === 'speaking' ||
    status === 'listening' ||
    status === 'switching';

  // 11. Done Speaking Action (Manual Turn Completion via Button or Spacebar)
  const handleDoneSpeaking = useCallback(() => {
    if (!isCallLive || panelistSpeaking) return;

    try {
      (controller as any)?.finishCandidateTurn?.();
    } catch (err) {
      console.warn('finishCandidateTurn failed:', err);
    }

    setDoneSpeakingFlash(true);
    setTimeout(() => {
      setDoneSpeakingFlash(false);
    }, 1200);

    import('@/lib/ui-sound')
      .then((m) => (m as any).playDoneSpeakingPop?.())
      .catch(() => {});
  }, [controller, isCallLive, panelistSpeaking]);

  // Spacebar keyboard listener for Done Speaking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = document.activeElement as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (isCallLive && !panelistSpeaking) {
        e.preventDefault();
        handleDoneSpeaking();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDoneSpeaking, isCallLive, panelistSpeaking]);

  // Stable Hold-Timer (Hysteresis) Note-Taking Hint Generator for Co-Panelists (2500ms hold)
  const [activeNoteHint, setActiveNoteHint] = useState<{ seat: PanelSeatId; text: string } | null>(null);
  const noteHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isCallLive) {
      if (noteHintTimerRef.current) {
        clearTimeout(noteHintTimerRef.current);
        noteHintTimerRef.current = null;
      }
      setActiveNoteHint(null);
      return;
    }

    const isSpeaking = candidateAudioLevel > 0.04 || livePartial?.speaker === 'candidate';
    if (!isSpeaking) return;

    const text = (livePartial?.speaker === 'candidate' ? livePartial.text : '').toLowerCase();

    // Default target: next seat in line
    let targetSeat = (activeSeat < 4 ? activeSeat + 1 : 1) as PanelSeatId;
    let hint = 'Jotting evaluation notes...';

    if (
      text.includes('rbi') ||
      text.includes('repo') ||
      text.includes('npa') ||
      text.includes('inflation') ||
      text.includes('crr') ||
      text.includes('policy') ||
      text.includes('monetary')
    ) {
      targetSeat = activeSeat === 2 ? 1 : 2;
      hint = 'Noting RBI policy response...';
    } else if (
      text.includes('degree') ||
      text.includes('academic') ||
      text.includes('economics') ||
      text.includes('college') ||
      text.includes('study') ||
      text.includes('research')
    ) {
      targetSeat = activeSeat === 3 ? 1 : 3;
      hint = 'Reviewing academic points...';
    } else if (
      text.includes('rural') ||
      text.includes('kisan') ||
      text.includes('branch') ||
      text.includes('customer') ||
      text.includes('hindi') ||
      text.includes('situation')
    ) {
      targetSeat = activeSeat === 4 ? 1 : 4;
      hint = 'Evaluating situational readiness...';
    } else if (
      text.includes('career') ||
      text.includes('bank') ||
      text.includes('psu') ||
      text.includes('motivation') ||
      text.includes('leadership')
    ) {
      targetSeat = activeSeat === 1 ? 2 : 1;
      hint = 'Noting career motivation...';
    }

    setActiveNoteHint({ seat: targetSeat, text: hint });

    if (noteHintTimerRef.current) {
      clearTimeout(noteHintTimerRef.current);
    }
    noteHintTimerRef.current = setTimeout(() => {
      setActiveNoteHint(null);
      noteHintTimerRef.current = null;
    }, 2500);
  }, [candidateAudioLevel, livePartial, isCallLive, activeSeat]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (noteHintTimerRef.current) clearTimeout(noteHintTimerRef.current);
      if (panelistSpeakingTimerRef.current) clearTimeout(panelistSpeakingTimerRef.current);
    };
  }, []);

  // Question counts per seat tracked from transcript
  const questionsAskedBySeat = React.useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const entry of transcript) {
      if (entry.speaker === 'panelist' && entry.seat) {
        counts[entry.seat] = (counts[entry.seat] || 0) + 1;
      }
    }
    return counts;
  }, [transcript]);

  const questionQuota = profile.sessionMode === 'quick' ? 2 : 3;

  // Last turn for live subtitle display when captions are on
  const latestTurn =
    transcript.length > 0 ? transcript[transcript.length - 1] : null;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-100 select-none">
      {/* Top Minimal Header */}
      <header className="h-12 px-5 flex items-center justify-between border-b border-white/[0.06] bg-zinc-950 shrink-0 z-30">
        {/* Left: Brand & Room title + Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rotate-45 bg-[#E5B869] shadow-[0_0_10px_rgba(229,184,105,0.5)] shrink-0 inline-block" />
            <span className="text-sm font-semibold tracking-tight text-white">
              Merit
            </span>
            <span className="text-zinc-600 text-xs">/</span>
            <span className="text-xs text-zinc-300 font-normal">
              {profile.name}
            </span>
            <span className="hidden sm:inline text-xs text-zinc-500 font-normal">
              · {profile.targetExam}
            </span>
          </div>

          <div className="h-3 w-px bg-white/10 mx-1 hidden sm:block" />

          {/* Status Indicator */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-white/[0.08] text-[11px] text-zinc-300">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isCallLive
                  ? 'bg-emerald-400 animate-pulse'
                  : status === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : status === 'error'
                  ? 'bg-red-400'
                  : 'bg-zinc-500'
              }`}
            />
            <span className="capitalize">
              {status === 'idle' ? 'Standby' : status}
            </span>
          </div>
        </div>

        {/* Right: Monospace Session Timer & Active Seat Tag */}
        <div className="flex items-center gap-3">
          {/* Active Seat Pill */}
          <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/[0.08] text-xs text-zinc-300">
            <span className="text-zinc-500 font-mono text-[11px]">Seat {activeSeat}/4</span>
            <span className="w-1 h-1 rounded-full bg-zinc-600" />
            <span className="font-medium text-zinc-200">{activePanelist.name}</span>
          </div>

          {/* Monospace Session Timer */}
          <div className="font-mono text-xs px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/[0.08] text-zinc-300 tracking-wider">
            {formatTime(sessionSeconds)}
          </div>
        </div>
      </header>

      {/* Dismissible Error Banner */}
      {errorMessage && (
        <div className="bg-red-950/60 border-b border-red-500/20 px-5 py-2 text-xs text-red-200 flex items-center justify-between z-30 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" strokeWidth={1.5} />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-white p-1 rounded transition"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Center Video Stage & Right Slide-Over Panel */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Main Video Stage */}
        <main className="flex-1 relative p-3 md:p-5 flex flex-col overflow-hidden">
          {/* Smooth Baton Handoff Toast Banner */}
          {handoffBanner && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none px-4 py-2 rounded-full bg-zinc-900/95 border border-white/15 shadow-2xl flex items-center gap-2.5 text-xs text-zinc-200 backdrop-blur-md animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>
                Floor passed to <strong className="text-white font-medium">{handoffBanner.toName}</strong>{' '}
                <span className="text-zinc-400">({handoffBanner.toTitle})</span>
              </span>
            </div>
          )}

          {/* Done Speaking Feedback Toast */}
          {doneSpeakingFlash && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none px-4 py-2 rounded-full bg-emerald-950/90 border border-emerald-500/40 shadow-2xl flex items-center gap-2 text-xs text-emerald-200 backdrop-blur-md animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Response logged · Panelist is replying...</span>
            </div>
          )}

          {layoutMode === 'spotlight' ? (
            /* Mode A: Spotlight View (Default) */
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4 h-full min-h-0 overflow-hidden">
              {/* Main Active Speaker Stage */}
              <div className="lg:col-span-8 xl:col-span-9 h-full min-h-0 flex flex-col">
                <PanelistCard
                  panelist={activePanelist}
                  isActive={true}
                  isSpeaking={panelistSpeaking}
                  audioLevel={panelistAudioLevel}
                  canPassMic={isCallLive}
                  variant="spotlight"
                  status={status}
                  questionsAsked={questionsAskedBySeat[activeSeat] || 0}
                  questionQuota={questionQuota}
                  canFinishTurn={isCallLive && !panelistSpeaking}
                  onDoneSpeaking={handleDoneSpeaking}
                  onPassMic={() => {
                    const next = (activeSeat < 4 ? activeSeat + 1 : 1) as PanelSeatId;
                    handlePassMic(next);
                  }}
                />
              </div>

              {/* Right Filmstrip Column */}
              <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-2.5 h-full min-h-0 overflow-y-auto pr-0.5">
                {/* Stacks other 3 panelists */}
                {otherPanelists.map((panelist) => {
                  let contextState = 'Taking notes';
                  if (status === 'idle') {
                    contextState = 'Ready';
                  } else if (panelist.seat < activeSeat) {
                    contextState = 'Completed turn';
                  } else if (
                    panelist.seat === activeSeat + 1 ||
                    (activeSeat === 4 && panelist.seat === 1)
                  ) {
                    contextState = 'Up next';
                  }

                  const hint =
                    activeNoteHint?.seat === panelist.seat
                      ? activeNoteHint.text
                      : null;

                  return (
                    <PanelistCard
                      key={panelist.seat}
                      panelist={panelist}
                      isActive={false}
                      isSpeaking={false}
                      audioLevel={0}
                      canPassMic={isCallLive}
                      variant="filmstrip"
                      status={status}
                      filmstripContextState={contextState}
                      questionsAsked={questionsAskedBySeat[panelist.seat] || 0}
                      questionQuota={questionQuota}
                      noteTakingHint={hint}
                      onPassMic={() => handlePassMic(panelist.seat)}
                    />
                  );
                })}

                {/* Docked Candidate Self-View at bottom of Filmstrip */}
                <div className="h-40 md:h-44 w-full shrink-0 mt-auto">
                  <WebcamMirror
                    candidateName={profile.name}
                    isInterviewActive={isCallLive}
                    isMicMuted={isMicMuted}
                    candidateAudioLevel={candidateAudioLevel}
                    isCameraOn={isCameraOn}
                    onToggleCamera={() => setIsCameraOn((prev) => !prev)}
                    onSnapshotsChange={(snaps) => setWebcamSnapshots(snaps)}
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Mode B: Grid View */
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 md:gap-4 h-full min-h-0 overflow-hidden">
              {/* 2x2 equal tiles on the left */}
              <div className="lg:col-span-8 xl:col-span-9 h-full min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                {PANELISTS.map((panelist) => {
                  const isActive = panelist.seat === activeSeat;
                  const hint =
                    !isActive && activeNoteHint?.seat === panelist.seat
                      ? activeNoteHint.text
                      : null;
                  return (
                    <PanelistCard
                      key={panelist.seat}
                      panelist={panelist}
                      isActive={isActive}
                      isSpeaking={isActive && panelistSpeaking}
                      audioLevel={isActive ? panelistAudioLevel : 0}
                      canPassMic={isCallLive}
                      variant="grid"
                      status={status}
                      questionsAsked={questionsAskedBySeat[panelist.seat] || 0}
                      questionQuota={questionQuota}
                      noteTakingHint={hint}
                      canFinishTurn={isActive && isCallLive && !panelistSpeaking}
                      onDoneSpeaking={handleDoneSpeaking}
                      onPassMic={() => {
                        if (isActive) {
                          const next = (activeSeat < 4 ? activeSeat + 1 : 1) as PanelSeatId;
                          handlePassMic(next);
                        } else {
                          handlePassMic(panelist.seat);
                        }
                      }}
                    />
                  );
                })}
              </div>

              {/* Right Sidebar in Grid View: Docked Candidate Self-View + Board Status */}
              <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-3 h-full min-h-0 overflow-y-auto pr-0.5">
                {/* Docked Candidate Self-View */}
                <div className="h-44 md:h-48 w-full shrink-0">
                  <WebcamMirror
                    candidateName={profile.name}
                    isInterviewActive={isCallLive}
                    isMicMuted={isMicMuted}
                    candidateAudioLevel={candidateAudioLevel}
                    isCameraOn={isCameraOn}
                    onToggleCamera={() => setIsCameraOn((prev) => !prev)}
                    onSnapshotsChange={(snaps) => setWebcamSnapshots(snaps)}
                    className="w-full h-full"
                  />
                </div>

                {/* Board Progression Card */}
                <div className="flex-1 bg-zinc-900/60 border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between overflow-y-auto min-h-[160px]">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                        Board Progression
                      </span>
                      <span className="text-[10px] font-mono text-zinc-400">
                        Seat {activeSeat} of 4
                      </span>
                    </div>

                    <div className="space-y-2">
                      {PANELISTS.map((p) => {
                        const isCurrent = p.seat === activeSeat;
                        const isPast = p.seat < activeSeat;
                        return (
                          <div
                            key={p.seat}
                            onClick={() => isCallLive && handlePassMic(p.seat)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition cursor-pointer ${
                              isCurrent
                                ? 'bg-zinc-800/90 border-white/30 text-white font-medium shadow-sm'
                                : isPast
                                ? 'bg-zinc-950/40 border-white/5 text-zinc-400'
                                : 'bg-zinc-900/40 border-white/5 text-zinc-300 hover:border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] shrink-0 ${
                                  isCurrent
                                    ? 'bg-white text-zinc-950 font-bold'
                                    : isPast
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-zinc-800 text-zinc-400'
                                }`}
                              >
                                {isPast ? '✓' : p.seat}
                              </span>
                              <span className="truncate">{p.name}</span>
                            </div>
                            <span className="text-[10px] text-zinc-400 shrink-0 font-mono">
                              {isCurrent
                                ? isCallLive
                                  ? 'Speaking'
                                  : 'Active'
                                : isPast
                                ? 'Done'
                                : 'Next'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-zinc-500 flex items-center justify-between">
                    <span>
                      {profile.sessionMode === 'quick' ? 'Express (2 turns)' : 'Comprehensive (3 turns)'}
                    </span>
                    <span className="text-zinc-400 font-mono">Room 1</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Netflix-Style Single-Line Rolling Closed Captions (CC Overlay) */}
          {showCaptions && (livePartial || (panelistSpeaking && latestTurn)) && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-[90%] md:w-auto px-5 py-2.5 rounded-xl bg-black/85 backdrop-blur-md border border-white/10 text-center pointer-events-none transition-all z-20 shadow-2xl">
              <span className="text-xs font-medium text-zinc-400 mr-2">
                {livePartial
                  ? livePartial.speaker === 'candidate'
                    ? profile.name
                    : activePanelist.name
                  : activePanelist.name}
                :
              </span>
              <span className="text-sm text-zinc-100 font-normal">
                {(() => {
                  const captionText = livePartial ? livePartial.text : latestTurn?.text || '';
                  const words = captionText.trim().split(/\s+/).filter(Boolean);
                  const rollingText =
                    words.length > 16 ? '...' + words.slice(-16).join(' ') : captionText;
                  return rollingText;
                })()}
              </span>
            </div>
          )}
        </main>

        {/* Right-Hand Slide-Over Side Panel (Drawer) */}
        {activeDrawer && (
          <aside className="w-80 md:w-96 border-l border-white/[0.08] bg-zinc-950 flex flex-col h-full shrink-0 z-30 transition-all">
            {/* Drawer Header & Tabs */}
            <div className="h-14 px-4 border-b border-white/[0.08] flex items-center justify-between shrink-0 bg-zinc-950">
              <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setActiveDrawer('chat')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    activeDrawer === 'chat'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Transcript & Chat
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDrawer('dossier')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                    activeDrawer === 'dossier'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Board Dossier
                </button>
              </div>

              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition"
                title="Close drawer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {/* Tab 1: Transcript & Text Input */}
            {activeDrawer === 'chat' && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Transcript Scroll Area */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3">
                  {transcript.length === 0 && !livePartial && (
                    <div className="flex flex-col items-center justify-center h-48 text-center text-zinc-500 text-xs">
                      <MessageSquare className="w-6 h-6 mb-2 text-zinc-600" strokeWidth={1.5} />
                      <p className="font-medium text-zinc-300">Board dialogue log</p>
                      <p className="text-[11px] mt-1 text-zinc-500 max-w-[220px]">
                        Verbatim turns and live transcripts will stream here once the interview starts.
                      </p>
                    </div>
                  )}

                  {transcript.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-xl text-xs space-y-1 ${
                        entry.speaker === 'candidate'
                          ? 'bg-zinc-900 border border-white/10 text-zinc-200 ml-4'
                          : entry.speaker === 'panelist'
                          ? 'bg-zinc-900/40 border border-white/[0.06] text-zinc-300 mr-4'
                          : 'bg-zinc-900/20 border border-white/[0.04] text-zinc-500 text-center italic py-1.5'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium text-zinc-300">
                          {entry.speakerName}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {new Date(entry.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{entry.text}</p>
                    </div>
                  ))}

                  {/* Streaming live caption */}
                  {livePartial && (
                    <div
                      className={`p-3 rounded-xl text-xs space-y-1 border border-white/20 bg-zinc-900/60 animate-pulse ${
                        livePartial.speaker === 'candidate' ? 'ml-4 text-zinc-200' : 'mr-4 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        <span>
                          {livePartial.speaker === 'candidate'
                            ? `${profile.name} (Speaking...)`
                            : `${activePanelist.name} (Speaking...)`}
                        </span>
                      </div>
                      <p className="leading-relaxed italic">{livePartial.text}</p>
                    </div>
                  )}

                  <div ref={transcriptEndRef} />
                </div>

                {/* Text Fallback Input & Demo Answer Trigger */}
                <div className="p-3 border-t border-white/[0.08] bg-zinc-950 space-y-2 shrink-0">
                  {/* Simulate Demo Answer for quick review */}
                  <button
                    type="button"
                    onClick={handleSimulateDemo}
                    disabled={!isCallLive}
                    className="w-full py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs text-zinc-300 hover:text-white flex items-center justify-center gap-1.5 transition disabled:opacity-40"
                    title="Send sample answer for silent testing"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
                    <span>Simulate Demo Answer (Seat {activeSeat})</span>
                  </button>

                  {/* Fallback Text Input */}
                  <form onSubmit={handleSendText} className="flex gap-2">
                    <input
                      type="text"
                      value={typedAnswer}
                      onChange={(e) => setTypedAnswer(e.target.value)}
                      placeholder="Type response (mic fallback)..."
                      disabled={!isCallLive}
                      className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/30 transition disabled:opacity-40"
                    />
                    <button
                      type="submit"
                      disabled={!typedAnswer.trim() || !isCallLive}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-xs transition disabled:opacity-30 flex items-center justify-center"
                    >
                      <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Tab 2: Board Dossier & RBI Rates */}
            {activeDrawer === 'dossier' && (
              <div className="flex-1 p-4 overflow-y-auto space-y-4 text-xs min-h-0">
                {/* Candidate Summary */}
                <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">{profile.name}</span>
                    <span className="font-mono text-[10px] text-zinc-400 uppercase">
                      {profile.targetExam}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Degree</span>
                      <span>
                        {profile.degree} ({profile.stream})
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Hometown</span>
                      <span>
                        {profile.hometown}, {profile.state}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Graduation</span>
                      <span>{profile.graduationYear}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Status</span>
                      <span className="capitalize">{profile.careerStatus}</span>
                    </div>
                  </div>
                </div>

                {/* Hometown Facts */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                    Hometown Facts ({profile.hometown})
                  </span>
                  <ul className="space-y-1">
                    {dossier.hometownFacts.map((fact, i) => (
                      <li
                        key={i}
                        className="p-2 rounded-lg bg-zinc-900/40 border border-white/[0.06] text-zinc-300 text-[11px] leading-relaxed"
                      >
                        {fact}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Degree Cross-Questions */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                    Degree Cross-Questions ({profile.degree})
                  </span>
                  <ul className="space-y-1">
                    {dossier.degreeCrossQuestions.map((q, i) => (
                      <li
                        key={i}
                        className="p-2 rounded-lg bg-zinc-900/40 border border-white/[0.06] text-zinc-300 text-[11px] leading-relaxed"
                      >
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* RBI 2026 Factsheet */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                    RBI 2026 Policy Reference
                  </span>
                  <pre className="p-3 rounded-lg bg-zinc-900/70 border border-white/[0.08] text-[11px] font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {dossier.rbiQuickRef}
                  </pre>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Bottom Google Meet Control Bar */}
      <footer className="h-20 px-6 flex items-center justify-between border-t border-white/[0.06] bg-zinc-950 shrink-0 z-30">
        {/* Left: Meeting Metadata & Layout Switcher Pill */}
        <div className="hidden md:flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-zinc-200">IBPS PO Board</span>
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-400">Panel Room 1</span>
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          {/* Layout Switcher Pill: Spotlight | Grid */}
          <div className="flex items-center p-0.5 rounded-lg bg-zinc-900 border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setLayoutMode('spotlight')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition cursor-pointer ${
                layoutMode === 'spotlight'
                  ? 'bg-zinc-800 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Spotlight view: Focus on active speaker"
            >
              <Layout className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>Spotlight</span>
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition cursor-pointer ${
                layoutMode === 'grid'
                  ? 'bg-zinc-800 text-white font-medium shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Grid view: View all panelists"
            >
              <LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>Grid</span>
            </button>
          </div>
        </div>

        {/* Center Control Dock */}
        <div className="flex items-center gap-2.5 mx-auto lg:mx-0">
          {!isCallLive && status !== 'connecting' ? (
            <button
              type="button"
              onClick={startInterview}
              className="bg-[#E5B869] hover:bg-[#ecd094] text-zinc-950 px-6 h-11 rounded-full text-sm font-semibold transition flex items-center gap-2 shadow-[0_0_25px_rgba(229,184,105,0.25)] cursor-pointer active:scale-[0.99]"
            >
              <Play className="w-4 h-4 fill-current text-zinc-950" strokeWidth={1.5} />
              <span>Join & Start Interview</span>
            </button>
          ) : (
            <>
              {/* Mic Mute / Unmute */}
              <button
                type="button"
                onClick={toggleMic}
                className={`h-11 px-4 rounded-full border transition flex items-center justify-center cursor-pointer ${
                  isMicMuted
                    ? 'bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-100 hover:bg-zinc-800'
                }`}
                title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMicMuted ? (
                  <MicOff className="w-4 h-4" strokeWidth={1.5} />
                ) : (
                  <Mic className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>

              {/* Done Speaking [Space] Pill Button */}
              {isCallLive && !panelistSpeaking && (
                <button
                  type="button"
                  onClick={handleDoneSpeaking}
                  className="h-11 px-4 rounded-full bg-[#E5B869]/15 hover:bg-[#E5B869]/25 border border-[#E5B869]/35 hover:border-[#E5B869]/60 text-[#F7E3B5] transition flex items-center gap-2 cursor-pointer shadow-md hover:shadow-[0_0_15px_rgba(229,184,105,0.2)] text-xs font-medium animate-fade-in"
                  title="Signal to panelist that you are finished speaking (Shortcut: Space)"
                >
                  <Check className="w-4 h-4 text-[#E5B869]" strokeWidth={2} />
                  <span>Done Speaking</span>
                  <span className="px-1.5 py-0.5 rounded bg-zinc-950/80 border border-[#E5B869]/40 font-mono text-[10px] text-[#F7E3B5] font-semibold shadow-inner">
                    Space
                  </span>
                </button>
              )}

              {/* Camera On / Off */}
              <button
                type="button"
                onClick={() => setIsCameraOn((prev) => !prev)}
                className={`h-11 px-4 rounded-full border transition flex items-center justify-center cursor-pointer ${
                  !isCameraOn
                    ? 'bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30'
                    : 'bg-zinc-900 border-white/10 text-zinc-100 hover:bg-zinc-800'
                }`}
                title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
              >
                {isCameraOn ? (
                  <Video className="w-4 h-4" strokeWidth={1.5} />
                ) : (
                  <VideoOff className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>

              {/* Closed Captions Toggle */}
              <button
                type="button"
                onClick={() => setShowCaptions((prev) => !prev)}
                className={`h-11 px-4 rounded-full border transition flex items-center justify-center cursor-pointer ${
                  showCaptions
                    ? 'bg-white/20 border-white/30 text-white'
                    : 'bg-zinc-900 border-white/10 text-zinc-400 hover:bg-zinc-800'
                }`}
                title={showCaptions ? 'Turn off captions' : 'Turn on captions'}
              >
                <Subtitles className="w-4 h-4" strokeWidth={1.5} />
              </button>

              {/* Interrupt / Barge-In Speaker */}
              <button
                type="button"
                onClick={handleBargeIn}
                className="h-11 px-4 rounded-full border border-white/10 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition flex items-center gap-2 cursor-pointer"
                title="Interrupt current speaker immediately"
              >
                <Hand className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline text-xs font-medium">Interrupt</span>
              </button>

              {/* Next Panelist / Pass Mic */}
              <button
                type="button"
                onClick={() => {
                  const next = (activeSeat < 4 ? activeSeat + 1 : 1) as PanelSeatId;
                  handlePassMic(next);
                }}
                className="h-11 px-4 rounded-full border border-white/10 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 transition flex items-center gap-1.5 cursor-pointer"
                title={`Pass mic to Seat ${activeSeat < 4 ? activeSeat + 1 : 1}`}
              >
                <span className="text-xs font-medium">Pass Mic</span>
                <SkipForward className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
              </button>

              {/* End Call & View Scorecard */}
              <button
                type="button"
                onClick={endInterview}
                className="bg-red-600 hover:bg-red-500 text-white px-5 h-11 rounded-full text-xs font-semibold flex items-center gap-2 shadow-lg transition cursor-pointer"
                title="Conclude interview and generate score report"
              >
                <PhoneOff className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">End Call</span>
              </button>
            </>
          )}
        </div>

        {/* Right: Drawer Toggles */}
        <div className="flex items-center gap-2">
          {/* Transcript & Chat Drawer Toggle */}
          <button
            type="button"
            onClick={() =>
              setActiveDrawer((prev) => (prev === 'chat' ? null : 'chat'))
            }
            className={`px-3.5 h-11 rounded-full border transition flex items-center gap-2 relative cursor-pointer ${
              activeDrawer === 'chat'
                ? 'bg-zinc-800 border-white/30 text-white'
                : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
            }`}
            title="Toggle Transcript & Chat Drawer"
          >
            <MessageSquare className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline text-xs font-medium">Chat</span>
            {transcript.length > 0 && (
              <span className="font-mono text-[10px] bg-zinc-800 px-1.5 py-0.2 rounded-full border border-white/10 text-zinc-300">
                {transcript.length}
              </span>
            )}
          </button>

          {/* Dossier Drawer Toggle */}
          <button
            type="button"
            onClick={() =>
              setActiveDrawer((prev) => (prev === 'dossier' ? null : 'dossier'))
            }
            className={`px-3.5 h-11 rounded-full border transition flex items-center gap-2 cursor-pointer ${
              activeDrawer === 'dossier'
                ? 'bg-zinc-800 border-white/30 text-white'
                : 'bg-zinc-900 border-white/10 text-zinc-300 hover:bg-zinc-800'
            }`}
            title="Toggle Pre-Interview Dossier & RBI Rates"
          >
            <FileText className="w-4 h-4" strokeWidth={1.5} />
            <span className="hidden sm:inline text-xs font-medium">Dossier</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
