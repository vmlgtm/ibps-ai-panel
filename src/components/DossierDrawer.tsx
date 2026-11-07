'use client';

import React from 'react';
import { CandidateProfile, PreInterviewDossier } from '@/lib/types';
import { RBI_FACTSHEET_SUMMARY } from '@/lib/rbi-factsheet';

interface DossierDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CandidateProfile;
  dossier: PreInterviewDossier;
}

export function DossierDrawer({ isOpen, onClose, profile, dossier }: DossierDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Backdrop click to dismiss */}
      <div className="flex-1" onClick={onClose} />

      {/* Drawer Panel */}
      <div className="w-full max-w-xl h-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-slideLeft">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-sm">
              📋
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Interview Board Dossier</h2>
              <p className="text-xs text-slate-400">
                Candidate: <strong className="text-slate-200">{profile.name}</strong> •{' '}
                {profile.targetExam}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Candidate Snapshot */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700 text-xs grid grid-cols-2 gap-2.5">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
                Degree & Stream
              </span>
              <span className="font-medium text-slate-200">
                {profile.degree} in {profile.stream} ({profile.graduationYear})
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
                Hometown & State
              </span>
              <span className="font-medium text-slate-200">
                {profile.hometown}, {profile.state}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
                Career Status
              </span>
              <span className="font-medium text-slate-200 capitalize">
                {profile.careerStatus} ({profile.gapOrWorkDetails})
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">
                Language & Mode
              </span>
              <span className="font-medium text-slate-200 capitalize">
                {profile.languagePref} • {profile.sessionMode} Mode
              </span>
            </div>
          </div>

          {/* Hometown Facts (Panelist 1 & 4 focus) */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>📍</span> Hometown & Regional Facts ({profile.hometown})
            </h3>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs text-slate-300">
              {dossier.hometownFacts?.length ? (
                dossier.hometownFacts.map((fact, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-amber-400 text-[10px] mt-0.5">•</span>
                    <span>{fact}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 italic">No specific hometown facts loaded.</p>
              )}
            </div>
          </div>

          {/* Degree Domain Cross-Questions (Panelist 3 focus) */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🎓</span> Degree Cross-Questions ({profile.degree} &rarr; Banking)
            </h3>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs text-slate-300">
              {dossier.degreeCrossQuestions?.length ? (
                dossier.degreeCrossQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-sky-400 font-semibold text-[11px]">{i + 1}.</span>
                    <span>{q}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 italic">No domain cross-questions generated.</p>
              )}
            </div>
          </div>

          {/* Current Banking Topics (Panelist 2 focus) */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>🏦</span> Current Banking & Regulatory Probes
            </h3>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs text-slate-300">
              {dossier.currentBankingTopics?.length ? (
                dossier.currentBankingTopics.map((topic, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-emerald-400 text-[10px] mt-0.5">•</span>
                    <span>{topic}</span>
                  </div>
                ))
              ) : (
                <p className="text-slate-500 italic">No banking topics loaded.</p>
              )}
            </div>
          </div>

          {/* RBI 2026 Monetary Policy Cheatsheet */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>📊</span> Official RBI 2026 Factsheet & Policy Rates
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-center">
                <span className="text-[10px] text-purple-300 block font-medium">Repo Rate</span>
                <span className="text-base font-bold text-white">6.50%</span>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-center">
                <span className="text-[10px] text-purple-300 block font-medium">SDF Rate</span>
                <span className="text-base font-bold text-white">6.25%</span>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-center">
                <span className="text-[10px] text-purple-300 block font-medium">MSF / Bank Rate</span>
                <span className="text-base font-bold text-white">6.75%</span>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-center">
                <span className="text-[10px] text-purple-300 block font-medium">Cash Reserve (CRR)</span>
                <span className="text-base font-bold text-white">4.50%</span>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-center">
                <span className="text-[10px] text-purple-300 block font-medium">Statutory (SLR)</span>
                <span className="text-base font-bold text-white">18.00%</span>
              </div>
              <div className="p-2.5 rounded-lg bg-purple-950/30 border border-purple-800/40 text-center">
                <span className="text-[10px] text-purple-300 block font-medium">DICGC Cover</span>
                <span className="text-base font-bold text-white">₹5 Lakh</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 font-mono">
              <p>• PSL Target: 40% ANBC (Agri 18%, SMF 10%, Micro 7.5%, Weaker 12%)</p>
              <p>• NPA Threshold: 90 days overdue (SMA-0: 1-30d | SMA-1: 31-60d | SMA-2: 61-90d)</p>
              <p>• Recovery: SARFAESI (secured &gt;₹1L) | IBC (180+90d NCLT) | DRT (&gt;=₹20L)</p>
              <p>• Schemes: PMJDY (₹10k OD) | Mudra (Shishu &le;50k, Kishore &le;5L, Tarun &le;10L/20L)</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
}
