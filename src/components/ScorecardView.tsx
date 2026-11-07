'use client';

import React, { useState } from 'react';
import { CandidateProfile, EvaluationReport, TranscriptEntry } from '@/lib/types';
import {
  Printer,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Camera,
  ShieldAlert,
  MessageSquare,
  FileText,
} from 'lucide-react';

interface ScorecardViewProps {
  report: EvaluationReport;
  profile: CandidateProfile;
  transcript: TranscriptEntry[];
  onPracticeAgain: () => void;
}

export function ScorecardView({
  report,
  profile,
  transcript,
  onPracticeAgain,
}: ScorecardViewProps) {
  // Segmented toggle for right column: 'debrief' (default) vs 'transcript'
  const [rightView, setRightView] = useState<'debrief' | 'transcript'>('debrief');

  // First 2 questions expanded by default
  const [expandedQuestions, setExpandedQuestions] = useState<Record<number, boolean>>({
    0: true,
    1: true,
  });

  const isQuestionExpanded = (idx: number) => {
    if (expandedQuestions[idx] !== undefined) {
      return expandedQuestions[idx];
    }
    return idx < 2;
  };

  const toggleQuestion = (idx: number) => {
    setExpandedQuestions((prev) => ({
      ...prev,
      [idx]: !isQuestionExpanded(idx),
    }));
  };

  const handlePrint = () => {
    window.print();
  };

  // Convert 100-mark interview score into 20-mark final merit equivalent (80:20 formula)
  const mainsWeightageEquivalent = ((report.overallScore * 20) / 100).toFixed(2);

  // Verdict theme helper
  const getVerdictTheme = (verdict: EvaluationReport['verdict'], score: number) => {
    if (verdict === 'Selected (High Merit)' || score >= 75) {
      return {
        label: 'Selected (High Merit)',
        textColor: 'text-emerald-400',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
        dot: 'bg-emerald-400',
        bar: 'bg-emerald-500',
      };
    }
    if (verdict === 'Selected (Borderline)' || (score >= 60 && score < 75)) {
      return {
        label: 'Selected (Borderline)',
        textColor: 'text-amber-300',
        badge: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
        dot: 'bg-amber-400',
        bar: 'bg-amber-400',
      };
    }
    if (verdict === 'Waitlisted' || (score >= 45 && score < 60)) {
      return {
        label: 'Waitlisted',
        textColor: 'text-orange-300',
        badge: 'bg-orange-500/10 text-orange-300 border-orange-500/25',
        dot: 'bg-orange-400',
        bar: 'bg-orange-400',
      };
    }
    return {
      label: 'Needs Improvement',
      textColor: 'text-rose-400',
      badge: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
      dot: 'bg-rose-400',
      bar: 'bg-rose-500',
    };
  };

  // Category progress color helper
  const getCategoryColor = (score: number, max: number) => {
    const pct = max > 0 ? (score / max) * 100 : 0;
    if (pct >= 75) {
      return {
        scoreClass: 'text-emerald-400',
        barClass: 'bg-emerald-500',
      };
    }
    if (pct >= 50) {
      return {
        scoreClass: 'text-amber-400',
        barClass: 'bg-amber-400',
      };
    }
    return {
      scoreClass: 'text-rose-400',
      barClass: 'bg-rose-500',
    };
  };

  // Question score pill helper
  const getQuestionScorePill = (scoreOutOf10: number) => {
    if (scoreOutOf10 >= 7.5) {
      return 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10';
    }
    if (scoreOutOf10 >= 5) {
      return 'text-amber-300 border-amber-500/25 bg-amber-500/10';
    }
    return 'text-rose-400 border-rose-500/25 bg-rose-500/10';
  };

  const verdictTheme = getVerdictTheme(report.verdict, report.overallScore);

  return (
    <div className="max-w-7xl mx-auto space-y-6 py-6 px-4 sm:px-6">
      {/* Top Brand Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.07] print:hidden">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rotate-45 bg-[#E5B869] shadow-[0_0_10px_rgba(229,184,105,0.5)] shrink-0 inline-block" />
          <span className="text-base font-semibold tracking-tight text-white">
            Merit
          </span>
          <span className="text-xs text-zinc-500 font-normal">
            IBPS &amp; SBI PO
          </span>
        </div>
        <div className="text-xs font-mono text-zinc-500">
          Executive Scorecard &amp; Board Deliberation
        </div>
      </div>

      {/* Top Executive Header Bar (Compact & High-Contrast) */}
      <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 print:border-none print:shadow-none print:p-0">
        {/* Left: Candidate Info & Semantic Verdict Pill */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              {profile.name}
            </h1>
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${verdictTheme.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${verdictTheme.dot}`} />
              <span>{verdictTheme.label}</span>
            </div>
          </div>
          <p className="text-xs text-zinc-400 font-normal">
            {profile.targetExam} · {profile.degree} in {profile.stream} · {profile.hometown}, {profile.state}
          </p>
        </div>

        {/* Right: Score Display + Mains 80:20 Weightage + Action Buttons */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 self-stretch md:self-auto justify-between md:justify-end">
          <div className="flex items-center gap-5 p-3 sm:px-4 rounded-xl border border-zinc-800 bg-zinc-950/80">
            <div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block">
                Interview score
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-3xl sm:text-4xl font-mono font-semibold tabular-nums ${verdictTheme.textColor}`}>
                  {report.overallScore}
                </span>
                <span className="text-xs text-zinc-500 font-normal">/100</span>
              </div>
            </div>

            <div className="border-l border-zinc-800/80 pl-4 text-right">
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 block">
                Mains 80:20
              </span>
              <div className="text-sm sm:text-base font-mono font-semibold text-zinc-200 tabular-nums mt-0.5">
                {mainsWeightageEquivalent}{' '}
                <span className="text-xs text-zinc-500 font-normal">/ 20</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              type="button"
              onClick={onPracticeAgain}
              className="px-3.5 py-2 rounded-lg bg-[#E5B869] hover:bg-[#ecd094] text-zinc-950 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-[0_0_20px_rgba(229,184,105,0.2)] active:scale-[0.99]"
            >
              <span>Practice again</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Main 2-Column Asymmetric Split (Left: lg:col-span-5, Right: lg:col-span-7) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Unified 5-Category Rubric & Strengths/Fixes) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. Single Unified Rubric Card (No Orphan 5th Box!) */}
          <div className="bg-zinc-900/50 border border-white/[0.08] rounded-xl p-5 divide-y divide-white/[0.06] shadow-md">
            <div className="pb-3.5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 tracking-tight">
                  Official 5-Category Rubric
                </h2>
                <p className="text-[11px] text-zinc-500">Structured 100-mark IBPS evaluation</p>
              </div>
              <span className="text-xs font-mono text-zinc-400">Total / 100</span>
            </div>

            {/* Category 1: Banking & Economic Awareness /30 */}
            {(() => {
              const item = report.categoryScores.bankingAwareness;
              const color = getCategoryColor(item.score, item.max);
              const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
              return (
                <div className="py-3.5 space-y-2 first:pt-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-medium text-zinc-200">
                        Banking &amp; economic awareness
                      </h3>
                      <p className="text-[11px] text-zinc-500">RBI Nominee &amp; Economist questions</p>
                    </div>
                    <div className="text-xs font-mono text-right tabular-nums shrink-0">
                      <span className={`font-semibold ${color.scoreClass}`}>{item.score}</span>
                      <span className="text-zinc-500"> / {item.max}</span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${color.barClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">{item.note}</p>
                </div>
              );
            })()}

            {/* Category 2: Profile & Career Conviction /25 */}
            {(() => {
              const item = report.categoryScores.personalProfileConviction;
              const color = getCategoryColor(item.score, item.max);
              const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
              return (
                <div className="py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-medium text-zinc-200">
                        Profile &amp; career conviction
                      </h3>
                      <p className="text-[11px] text-zinc-500">Chairman introductory inquiries</p>
                    </div>
                    <div className="text-xs font-mono text-right tabular-nums shrink-0">
                      <span className={`font-semibold ${color.scoreClass}`}>{item.score}</span>
                      <span className="text-zinc-500"> / {item.max}</span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${color.barClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">{item.note}</p>
                </div>
              );
            })()}

            {/* Category 3: Situational Officer Qualities /20 */}
            {(() => {
              const item = report.categoryScores.situationalOfficerQualities;
              const color = getCategoryColor(item.score, item.max);
              const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
              return (
                <div className="py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-medium text-zinc-200">
                        Situational officer qualities
                      </h3>
                      <p className="text-[11px] text-zinc-500">CGM Rural &amp; branch crises</p>
                    </div>
                    <div className="text-xs font-mono text-right tabular-nums shrink-0">
                      <span className={`font-semibold ${color.scoreClass}`}>{item.score}</span>
                      <span className="text-zinc-500"> / {item.max}</span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${color.barClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">{item.note}</p>
                </div>
              );
            })()}

            {/* Category 4: Honesty & Anti-Bluff Integrity /15 */}
            {(() => {
              const item = report.categoryScores.honestyAntiBluff;
              const color = getCategoryColor(item.score, item.max);
              const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
              return (
                <div className="py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-medium text-zinc-200">
                        Honesty &amp; anti-bluff integrity
                      </h3>
                      <p className="text-[11px] text-zinc-500">Admitting unknowns vs guessing</p>
                    </div>
                    <div className="text-xs font-mono text-right tabular-nums shrink-0">
                      <span className={`font-semibold ${color.scoreClass}`}>{item.score}</span>
                      <span className="text-zinc-500"> / {item.max}</span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${color.barClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">{item.note}</p>
                  {item.bluffsDetected?.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-400 space-y-1">
                      <span className="text-amber-400 flex items-center gap-1.5 font-medium text-[11px]">
                        <ShieldAlert className="w-3.5 h-3.5" strokeWidth={1.5} />
                        Bluff alerts noted:
                      </span>
                      {item.bluffsDetected.map((bluff, idx) => (
                        <p key={idx} className="text-zinc-400 pl-3.5 text-xs">
                          · {bluff}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Category 5: Communication & Body Language /10 */}
            {(() => {
              const item = report.categoryScores.communicationAndBodyLanguage;
              const color = getCategoryColor(item.score, item.max);
              const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
              return (
                <div className="pt-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-medium text-zinc-200">
                        Communication &amp; body language
                      </h3>
                      <p className="text-[11px] text-zinc-500">Webcam posture &amp; composure</p>
                    </div>
                    <div className="text-xs font-mono text-right tabular-nums shrink-0">
                      <span className={`font-semibold ${color.scoreClass}`}>{item.score}</span>
                      <span className="text-zinc-500"> / {item.max}</span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-300 ${color.barClass}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">{item.note}</p>
                  {item.webcamObservations?.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-400 space-y-1">
                      <span className="text-zinc-300 flex items-center gap-1.5 font-medium text-[11px]">
                        <Camera className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
                        Webcam observations:
                      </span>
                      {item.webcamObservations.map((obs, idx) => (
                        <p key={idx} className="text-zinc-400 pl-3.5 text-xs">
                          · {obs}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* 2. Strengths & Priority Fixes Card */}
          <div className="bg-zinc-900/50 border border-white/[0.08] rounded-xl p-5 space-y-4 shadow-md">
            {/* Key Strengths */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
                <span>Key strengths</span>
              </h3>
              <ul className="space-y-2 text-xs text-zinc-300">
                {report.topStrengths?.map((strength, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-500 font-mono text-[10px] mt-0.5 font-semibold">
                      0{idx + 1}
                    </span>
                    <span className="leading-relaxed">{strength}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-white/[0.06] pt-4 space-y-2.5">
              {/* Priority Improvements */}
              <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
                <span>Priority improvements</span>
              </h3>
              <ul className="space-y-2 text-xs text-zinc-300">
                {report.actionItems?.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-500 font-mono text-[10px] mt-0.5 font-semibold">
                      0{idx + 1}
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right Column (Question-by-Question Debrief & Raw Transcript, Visible Immediately!) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Header of Right Column with Toggle */}
          <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/[0.06] print:hidden">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">
                Question-by-Question Debrief
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                {report.questionByQuestion?.length || 0}
              </span>
            </div>

            {/* Segmented Toggle: Debrief | Raw transcript */}
            <div className="flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setRightView('debrief')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  rightView === 'debrief'
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText className="w-3 h-3" strokeWidth={1.5} />
                <span>Debrief</span>
              </button>
              <button
                type="button"
                onClick={() => setRightView('transcript')}
                className={`px-3 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                  rightView === 'transcript'
                    ? 'bg-zinc-800 text-zinc-100 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MessageSquare className="w-3 h-3" strokeWidth={1.5} />
                <span>Raw transcript ({transcript.length})</span>
              </button>
            </div>
          </div>

          {/* Debrief View: Visible Immediately, First 2 Questions Expanded by Default */}
          {rightView === 'debrief' && (
            <div className="space-y-4">
              {report.questionByQuestion?.length ? (
                report.questionByQuestion.map((q, idx) => {
                  const isExpanded = isQuestionExpanded(idx);
                  const pillClass = getQuestionScorePill(q.scoreOutOf10);
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-white/[0.08] bg-zinc-900/40 overflow-hidden transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => toggleQuestion(idx)}
                        className="w-full p-4 flex items-start justify-between gap-4 text-left hover:bg-zinc-900/60 transition-colors cursor-pointer"
                      >
                        <div className="space-y-1 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-zinc-400">
                              Question {idx + 1} · {q.askedBy}
                            </span>
                          </div>
                          <h4 className="text-sm font-medium text-zinc-100 leading-snug">
                            {q.question}
                          </h4>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <div className={`text-xs tabular-nums font-semibold px-2.5 py-1 rounded border ${pillClass}`}>
                            {q.scoreOutOf10}{' '}
                            <span className="text-zinc-500 font-normal">/ 10</span>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-zinc-500" strokeWidth={1.5} />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 space-y-3 text-xs border-t border-zinc-800/60 animate-fade-in">
                          {/* Your response */}
                          <div className="p-3 rounded-lg bg-zinc-950/80 border border-white/[0.06] space-y-1">
                            <span className="text-[11px] font-medium text-zinc-400 block">
                              Your response
                            </span>
                            <p className="text-zinc-300 italic font-sans leading-relaxed">
                              {q.candidateAnswer || '(Candidate was silent or response unrecorded)'}
                            </p>
                          </div>

                          {/* Panel critique */}
                          <div className="space-y-1">
                            <span className="text-[11px] font-medium text-zinc-400 block">
                              Panel critique
                            </span>
                            <p className="text-zinc-300 font-sans leading-relaxed">
                              {q.critique}
                            </p>
                          </div>

                          {/* Ideal panel response */}
                          <div className="border-l-2 border-emerald-500/70 bg-emerald-500/[0.04] pl-3.5 py-2.5 rounded-r-lg text-zinc-200 border border-emerald-500/10 space-y-1">
                            <span className="text-[11px] font-semibold text-emerald-400 block">
                              Ideal panel response
                            </span>
                            <p className="text-zinc-200 font-sans leading-relaxed">
                              {q.idealModelAnswer}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-zinc-500 bg-zinc-900/30 rounded-xl border border-zinc-800 text-xs">
                  No detailed question-by-question breakdown was returned by the evaluator.
                </div>
              )}
            </div>
          )}

          {/* Raw Transcript View */}
          {rightView === 'transcript' && (
            <div className="space-y-2.5">
              {transcript.map((entry) => (
                <div
                  key={entry.id}
                  className={`p-3.5 rounded-xl border text-xs ${
                    entry.speaker === 'candidate'
                      ? 'bg-zinc-900/80 border-white/[0.12] ml-8 text-zinc-100'
                      : entry.speaker === 'panelist'
                      ? 'bg-zinc-950 border-zinc-800 mr-8 text-zinc-300'
                      : 'bg-zinc-950/50 border-zinc-800/60 text-zinc-500 text-center italic'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[12px] font-medium text-zinc-200">
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
                  <p className="leading-relaxed font-sans">{entry.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
