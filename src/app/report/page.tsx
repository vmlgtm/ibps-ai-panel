'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CandidateProfile,
  EvaluationReport,
  TranscriptEntry,
} from '@/lib/types';
import { SAMPLE_PROFILES } from '@/lib/rbi-factsheet';
import { ScorecardView } from '@/components/ScorecardView';
import { recordCompletedRoundQuestions } from '@/lib/question-memory';
import { Loader2, AlertCircle, Camera } from 'lucide-react';

// Fallback transcript if someone visits /report directly
const DEFAULT_TRANSCRIPT: TranscriptEntry[] = [
  {
    id: 't-1',
    speaker: 'panelist',
    seat: 1,
    speakerName: 'Shri R.K. Deshmukh (Chairman)',
    text: 'Good morning, please make yourself comfortable. To begin with, tell us about yourself and why a graduate like you wants to pursue public sector banking.',
    timestamp: Date.now() - 300000,
  },
  {
    id: 't-2',
    speaker: 'candidate',
    speakerName: 'Aarav Sharma',
    text: 'Good morning respected Chairman and board members. Having graduated in computer science, I observed how digital public infrastructure like UPI and CBDC has transformed rural banking. A PO role allows me to combine technological acumen with direct financial inclusion.',
    timestamp: Date.now() - 240000,
  },
  {
    id: 't-3',
    speaker: 'panelist',
    seat: 2,
    speakerName: 'Shri S. Narayanan (RBI Nominee)',
    text: 'Can you specify the current Repo Rate and explain how an increase in Repo impacts bank lending rates and retail inflation?',
    timestamp: Date.now() - 180000,
  },
  {
    id: 't-4',
    speaker: 'candidate',
    speakerName: 'Aarav Sharma',
    text: 'Sir, the Policy Repo Rate is 6.50%. When RBI increases Repo, borrowing becomes costlier for commercial banks. Banks consequently raise their benchmark EBLR and MCLR lending rates, cooling credit growth and moderating demand-pull inflation.',
    timestamp: Date.now() - 120000,
  },
  {
    id: 't-5',
    speaker: 'panelist',
    seat: 4,
    speakerName: 'Shri Rajeshwar Rao (CGM Rural)',
    text: 'Agar aapki posting ek remote rural branch mein hoti hai jahan kisan bhai KCC subsidy ke delay par aakar gussa hote hain, aap unhe kaise handle karenge?',
    timestamp: Date.now() - 60000,
  },
  {
    id: 't-6',
    speaker: 'candidate',
    speakerName: 'Aarav Sharma',
    text: 'Sir, sabse pehle main unhe aadar se baithaunga aur unki baat poori shanti se sununga. Kisan bhaiyon ke liye samay par loan milna bohot zaroori hota hai. Portal par DBT status check karke unhe sach bataunga aur Lead Bank ya district agriculture officer se coordinate karke turant hal nikalunga.',
    timestamp: Date.now() - 10000,
  },
];

const LOADING_STEPS = [
  'Convening the 4-Member IBPS Interview Board...',
  'Cross-verifying responses against RBI 2026 Monetary Policy & Regulatory Norms...',
  'Analyzing Degree domain rationale & career conviction...',
  'Evaluating honesty & anti-bluff score on unknown questions...',
  'Synthesizing webcam posture snapshots & body language...',
  'Computing 100-Mark official IBPS PO Merit Scorecard...',
];

export default function ReportPage() {
  const router = useRouter();

  const [profile, setProfile] = useState<CandidateProfile>(SAMPLE_PROFILES[0]);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>(DEFAULT_TRANSCRIPT);
  const [webcamSnapshots, setWebcamSnapshots] = useState<string[]>([]);
  const [report, setReport] = useState<EvaluationReport | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingStepIdx, setLoadingStepIdx] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cycling multi-step loading message
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setLoadingStepIdx((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isLoading]);

  const runEvaluation = useCallback(
    async (
      candidateProf: CandidateProfile,
      interviewTranscript: TranscriptEntry[],
      snapshots: string[]
    ) => {
      setIsLoading(true);
      setErrorMessage(null);

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

        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            profile: candidateProf,
            transcript: interviewTranscript,
            webcamSnapshots: snapshots,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Evaluation failed with status ${res.status}`);
        }

        const data = await res.json();
        const resolvedReport: EvaluationReport = data.report || data;
        setReport(resolvedReport);

        // Cache report in sessionStorage
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('ibps_evaluation_report', JSON.stringify(resolvedReport));
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('Error generating scorecard evaluation:', error);
        setErrorMessage(error.message);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Load from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let prof = SAMPLE_PROFILES[0];
    let trans = DEFAULT_TRANSCRIPT;
    let snaps: string[] = [];

    try {
      const storedProf = sessionStorage.getItem('ibps_candidate_profile');
      if (storedProf) {
        prof = JSON.parse(storedProf);
        setProfile(prof);
      }

      const storedTrans = sessionStorage.getItem('ibps_transcript');
      if (storedTrans) {
        const parsed = JSON.parse(storedTrans);
        if (Array.isArray(parsed) && parsed.length > 0) {
          trans = parsed;
          setTranscript(parsed);
        }
      }

      const storedSnaps = sessionStorage.getItem('ibps_webcam_snapshots');
      if (storedSnaps) {
        snaps = JSON.parse(storedSnaps);
        setWebcamSnapshots(snaps);
      }

      // Check if report already exists in sessionStorage
      const cachedReport = sessionStorage.getItem('ibps_evaluation_report');
      if (cachedReport) {
        try {
          const parsedRaw = JSON.parse(cachedReport);
          const parsedReport: EvaluationReport = parsedRaw?.report || parsedRaw;
          if (parsedReport && parsedReport.categoryScores) {
            setReport(parsedReport);
            setIsLoading(false);
            return;
          }
        } catch {}
      }
    } catch (err) {
      console.warn('Error reading from sessionStorage:', err);
    }

    // Trigger evaluation
    runEvaluation(prof, trans, snaps);
  }, [runEvaluation]);

  const extractQuestionsFromSession = (
    evalReport: EvaluationReport | null,
    transcriptEntries: TranscriptEntry[]
  ): string[] => {
    const list: string[] = [];
    if (evalReport?.questionByQuestion) {
      for (const item of evalReport.questionByQuestion) {
        if (item.question?.trim()) {
          list.push(item.question.trim());
        }
      }
    }
    for (const entry of transcriptEntries) {
      if (entry.speaker === 'panelist' && entry.text.includes('?')) {
        list.push(entry.text.trim());
      }
    }
    return list;
  };

  const handleRetrySameRound = () => {
    if (typeof window !== 'undefined') {
      // Keep ibps_dossier and ibps_candidate_profile intact for exact angle retry
      sessionStorage.removeItem('ibps_evaluation_report');
      sessionStorage.removeItem('ibps_transcript');
    }
    router.push('/room');
  };

  const handleNextRound = () => {
    if (typeof window !== 'undefined') {
      const questions = extractQuestionsFromSession(report, transcript);
      if (questions.length > 0) {
        recordCompletedRoundQuestions(questions);
      }
      sessionStorage.removeItem('ibps_evaluation_report');
      sessionStorage.removeItem('ibps_transcript');
      sessionStorage.removeItem('ibps_dossier');
    }
    router.push('/');
  };

  const handlePracticeAgain = () => {
    handleNextRound();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-white selection:text-zinc-950">
      {/* Loading Screen */}
      {isLoading && (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900/60 border border-white/[0.08] shadow-2xl space-y-6">
            {/* Minimalist Monochrome Spinner */}
            <div className="w-12 h-12 mx-auto rounded-full border border-zinc-800 bg-zinc-950 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-zinc-100 animate-spin" strokeWidth={1.5} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="text-sm font-medium text-zinc-100">
                  Board deliberation in progress
                </h2>
              </div>
              <p className="text-xs text-zinc-400 min-h-[36px] transition-all duration-300">
                {LOADING_STEPS[loadingStepIdx]}
              </p>
            </div>

            {/* Candidate & Board summary */}
            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-400 space-y-1">
              <div className="flex justify-between items-center text-zinc-300">
                <span className="text-zinc-500">Candidate</span>
                <span className="text-zinc-100 font-medium">{profile.name}</span>
              </div>
              <div className="flex justify-between items-center text-zinc-400 text-[11px]">
                <span className="text-zinc-500">Exam</span>
                <span>{profile.targetExam} · {transcript.length} turns</span>
              </div>
              {webcamSnapshots.length > 0 && (
                <div className="flex items-center gap-1.5 text-zinc-400 text-[11px] pt-1 border-t border-zinc-800/60">
                  <Camera className="w-3 h-3 text-zinc-400" strokeWidth={1.5} />
                  <span>{webcamSnapshots.length} posture frames captured</span>
                </div>
              )}
            </div>

            {/* Step counter & Thin white-on-zinc progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] text-zinc-500 font-mono">
                <span>Step {loadingStepIdx + 1} of {LOADING_STEPS.length}</span>
                <span>{Math.round(((loadingStepIdx + 1) / LOADING_STEPS.length) * 100)}%</span>
              </div>
              <div className="w-full bg-zinc-800 h-1 rounded-full overflow-hidden">
                <div
                  className="bg-white h-1 rounded-full transition-all duration-500"
                  style={{
                    width: `${((loadingStepIdx + 1) / LOADING_STEPS.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Screen with Retry */}
      {!isLoading && errorMessage && !report && (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full p-8 rounded-2xl bg-zinc-900 border border-white/[0.08] shadow-2xl space-y-6">
            <div className="w-12 h-12 mx-auto rounded-full border border-red-800/60 bg-red-950/30 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-400" strokeWidth={1.5} />
            </div>
            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider font-mono text-zinc-100">
                Evaluation Deliberation Error
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">{errorMessage}</p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => runEvaluation(profile, transcript, webcamSnapshots)}
                className="flex-1 py-2.5 px-4 rounded-lg bg-white hover:bg-zinc-200 text-zinc-950 font-medium text-xs transition-colors cursor-pointer"
              >
                Retry Evaluation
              </button>
              <button
                type="button"
                onClick={handlePracticeAgain}
                className="py-2.5 px-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-mono transition-colors cursor-pointer"
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scorecard View */}
      {!isLoading && report && (
        <ScorecardView
          report={report}
          profile={profile}
          transcript={transcript}
          onPracticeAgain={handlePracticeAgain}
          onRetrySameRound={handleRetrySameRound}
          onNextRound={handleNextRound}
        />
      )}
    </div>
  );
}
