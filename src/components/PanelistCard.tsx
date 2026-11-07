'use client';

import React from 'react';
import { PanelistConfig } from '@/lib/types';
import { LiveSessionStatus } from '@/lib/gemini-live-client';
import {
  ArrowRight,
  Volume2,
  CheckCircle2,
  Clock,
  Edit3,
  Sparkles,
  PenLine,
  CornerDownLeft,
} from 'lucide-react';

export type PanelistCardVariant = 'spotlight' | 'filmstrip' | 'grid';

export interface PanelistCardProps {
  panelist: PanelistConfig;
  isActive: boolean;
  isSpeaking: boolean;
  audioLevel?: number; // 0 to 1
  onPassMic?: () => void;
  canPassMic?: boolean;
  variant?: PanelistCardVariant;
  status?: LiveSessionStatus;
  filmstripContextState?: string; // 'Up next' | 'Taking notes' | 'Completed turn' | 'Ready'
  questionsAsked?: number;
  questionQuota?: number;
  noteTakingHint?: string | null;
  onDoneSpeaking?: () => void;
  canFinishTurn?: boolean;
}

const PANEL_ROLE_DETAILS: Record<
  number,
  { title: string; subtitle: string; shortRole: string }
> = {
  1: {
    title: 'Chairman · Seat 1',
    subtitle: 'Retd. CMD, Public Sector Bank · Personal Profile & Career Motivation',
    shortRole: 'Chairman',
  },
  2: {
    title: 'RBI Nominee · Seat 2',
    subtitle: 'Banking Operations & Regulations · Monetary Policy & NPAs',
    shortRole: 'RBI Nominee',
  },
  3: {
    title: 'Academician · Seat 3',
    subtitle: 'Professor of Banking & Economics · Macroeconomics & Degree Linkages',
    shortRole: 'Academician',
  },
  4: {
    title: 'CGM (HR) · Seat 4',
    subtitle: 'Rural Banking Operations · Situational Judgment & Hindi Readiness',
    shortRole: 'CGM (HR)',
  },
};

const BAR_WEIGHTS = [0.35, 0.65, 0.9, 1.25, 0.75, 1.4, 1.1, 0.8, 1.3, 0.95, 0.6, 0.4];

export function PanelistCard({
  panelist,
  isActive,
  isSpeaking,
  audioLevel = 0,
  onPassMic,
  canPassMic = true,
  variant = 'grid',
  status = 'idle',
  filmstripContextState,
  questionsAsked = 0,
  questionQuota = 2,
  noteTakingHint = null,
  onDoneSpeaking,
  canFinishTurn = false,
}: PanelistCardProps) {
  const details = PANEL_ROLE_DETAILS[panelist.seat] || {
    title: `Panelist · Seat ${panelist.seat}`,
    subtitle: panelist.roleFocus,
    shortRole: `Seat ${panelist.seat}`,
  };

  const quota = Math.max(1, questionQuota);
  const asked = Math.max(0, questionsAsked);

  const renderProgressDots = (dotSize = 'w-1.5 h-1.5') => (
    <div
      className="flex items-center gap-1 shrink-0"
      title={`Questions: ${asked}/${quota}`}
    >
      {Array.from({ length: quota }).map((_, i) => (
        <span
          key={i}
          className={`${dotSize} rounded-full transition-all duration-200 ${
            i < asked
              ? 'bg-[#E5B869] shadow-[0_0_8px_rgba(229,184,105,0.7)]'
              : 'bg-white/20'
          }`}
        />
      ))}
    </div>
  );

  // Determine Spotlight contextual status text
  let statusText = 'Ready · Click Join & Start Interview below';
  let dotColor = 'bg-zinc-500';
  let dotPulse = false;

  if (status === 'connecting') {
    statusText = 'Connecting to board session...';
    dotColor = 'bg-amber-400';
    dotPulse = true;
  } else if (status === 'switching') {
    statusText = 'Passing mic to next member...';
    dotColor = 'bg-blue-400';
    dotPulse = true;
  } else if (isSpeaking) {
    statusText = 'Speaking to candidate...';
    dotColor = 'bg-emerald-400';
    dotPulse = true;
  } else if (isActive && (status === 'connected' || status === 'listening')) {
    statusText = 'Listening to your answer...';
    dotColor = 'bg-sky-400';
    dotPulse = true;
  } else if (status === 'completed') {
    statusText = 'Interview concluded';
    dotColor = 'bg-zinc-400';
    dotPulse = false;
  }

  // ---------------------------------------------------------------------------
  // 1. FILMSTRIP VARIANT (Compact horizontal participant card on the right)
  // ---------------------------------------------------------------------------
  if (variant === 'filmstrip') {
    const contextLabel = filmstripContextState || (isActive ? 'Speaking' : 'Taking notes');

    return (
      <div className={`relative rounded-xl bg-zinc-900/60 hover:bg-zinc-900/90 border p-3 flex items-center justify-between transition-all duration-200 group overflow-hidden select-none flex-1 min-h-[105px] ${
        isActive
          ? 'border-[#E5B869]/60 ring-1 ring-[#E5B869]/20'
          : 'border-white/[0.08] hover:border-white/20'
      }`}>
        {/* Left Side: Avatar & Details */}
        <div className="flex items-center gap-3 min-w-0 pr-2">
          {/* Avatar circle */}
          <div className="relative shrink-0">
            <div className="w-12 h-12 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center text-sm font-semibold text-zinc-100 shadow-inner">
              {panelist.avatarInitials}
            </div>
            {/* Seat badge overlay */}
            <span className="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full bg-zinc-950 border border-white/20 font-mono text-[9px] text-zinc-300">
              S{panelist.seat}
            </span>
          </div>

          {/* Text block */}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-medium text-xs text-zinc-100 truncate">
                {panelist.name}
              </span>
              {renderProgressDots('w-1.5 h-1.5')}
            </div>
            <span className="text-[11px] text-zinc-400 truncate">
              {details.shortRole}
            </span>

            {/* Context state pill or Live Note-Taking micro-reaction (Fixed Height to prevent layout shift) */}
            <div className="h-6 flex items-center mt-1">
              {!isActive && noteTakingHint ? (
                <div className="text-[11px] text-zinc-300 bg-white/[0.05] border border-white/10 px-2 py-0.5 rounded-full flex items-center gap-1.5 transition-all duration-300 shadow-sm">
                  <PenLine className="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
                  <span className="truncate max-w-[150px] text-[10px] text-zinc-300">{noteTakingHint}</span>
                </div>
              ) : contextLabel === 'Completed turn' ? (
                <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Completed turn</span>
                </div>
              ) : contextLabel === 'Up next' ? (
                <div className="flex items-center gap-1 text-[10px] text-amber-300 font-medium">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Up next</span>
                </div>
              ) : contextLabel === 'Speaking' ? (
                <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  <span>Speaking</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Edit3 className="w-2.5 h-2.5 text-zinc-500" />
                  <span>Taking notes</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Pass Mic Button on hover */}
        {canPassMic && (
          <div className="shrink-0 flex items-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPassMic?.();
              }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 border border-white/15 flex items-center gap-1.5 shadow-md cursor-pointer whitespace-nowrap"
              title={`Pass mic to ${panelist.name}`}
            >
              <span>Pass Mic</span>
              <ArrowRight className="w-3 h-3 text-zinc-300" strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. SPOTLIGHT VARIANT (Main Active Speaker Stage)
  // ---------------------------------------------------------------------------
  if (variant === 'spotlight') {
    return (
      <div className={`relative rounded-2xl bg-zinc-950/80 md:bg-zinc-900/50 border flex flex-col items-center justify-center overflow-hidden w-full h-full group select-none shadow-2xl backdrop-blur-sm ${
        isActive
          ? 'border-[#E5B869]/60 ring-1 ring-[#E5B869]/20'
          : 'border-white/[0.12] ring-1 ring-white/10'
      }`}>
        {/* Ambient background radial glow steady based strictly on isActive (Zero Flickering) */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-500 flex items-center justify-center overflow-hidden"
          style={{
            opacity: isActive ? 0.25 : 0.05,
          }}
        >
          <div
            className="w-[420px] h-[420px] rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, rgba(229, 184, 105, 0.45) 0%, rgba(24,24,27,0) 70%)`,
            }}
          />
        </div>

        {/* Top-Right: Pass Mic & State Pill */}
        <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
          {canPassMic && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPassMic?.();
              }}
              className="opacity-80 group-hover:opacity-100 focus:opacity-100 transition-opacity px-3 py-1.5 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/90 text-xs text-zinc-200 border border-white/15 flex items-center gap-1.5 shadow-md cursor-pointer backdrop-blur-sm"
              title="Pass microphone to next member"
            >
              <span>Next Member</span>
              <ArrowRight className="w-3.5 h-3.5 text-zinc-300" strokeWidth={1.5} />
            </button>
          )}

          {/* Active Audio State Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/15 shadow-sm text-xs text-zinc-200">
            <span
              className={`w-2 h-2 rounded-full ${
                isSpeaking
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-white/70'
              }`}
            />
            <span className="font-mono text-[11px] text-zinc-300">
              {isSpeaking ? 'Speaking' : 'Active Speaker'}
            </span>
          </div>
        </div>

        {/* Center: Large Avatar (w-28 h-28) + Concentric Voice Rings */}
        <div className="relative flex flex-col items-center justify-center z-10 my-auto">
          <div className="relative flex items-center justify-center">
            {/* Concentric Voice Ripple Rings (when speaking) */}
            {isSpeaking && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span
                  className="absolute rounded-full border border-[#E5B869]/35 transition-transform duration-75 shadow-[0_0_15px_rgba(229,184,105,0.2)]"
                  style={{
                    width: `${120 + Math.min(80, audioLevel * 120)}px`,
                    height: `${120 + Math.min(80, audioLevel * 120)}px`,
                    opacity: Math.max(0.3, Math.min(0.9, audioLevel * 1.5)),
                  }}
                />
                <span
                  className="absolute rounded-full border border-[#E5B869]/20 transition-transform duration-75"
                  style={{
                    width: `${155 + Math.min(100, audioLevel * 160)}px`,
                    height: `${155 + Math.min(100, audioLevel * 160)}px`,
                    opacity: Math.max(0.15, Math.min(0.65, audioLevel * 0.9)),
                  }}
                />
              </div>
            )}

            {/* Calm breathing ring when listening / idle */}
            {isActive && !isSpeaking && (
              <span className="absolute w-36 h-36 rounded-full border border-[#E5B869]/20 animate-pulse pointer-events-none" />
            )}

            {/* Avatar Circle */}
            <div className={`w-28 h-28 rounded-full bg-zinc-800/90 border-2 flex items-center justify-center text-3xl font-semibold tracking-wider text-zinc-100 shadow-2xl select-none ${
              isActive ? 'border-[#E5B869]/40' : 'border-white/20'
            }`}>
              {panelist.avatarInitials}
            </div>
          </div>

          {/* 12-Bar Reactive Audio Frequency Visualizer (GPU-Accelerated scaleY, Zero Layout Shift) */}
          <div className="flex items-end justify-center gap-1.5 h-8 px-4 py-1 mt-5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 shadow-sm">
            {BAR_WEIGHTS.map((weight, i) => {
              const scale = isSpeaking
                ? Math.max(0.15, Math.min(1.0, 0.15 + audioLevel * weight * 0.85))
                : 0.15;
              return (
                <span
                  key={i}
                  className={`w-1 h-6 rounded-full origin-bottom transition-transform duration-150 ease-out will-change-transform ${
                    isSpeaking ? 'bg-[#E5B869] shadow-[0_0_8px_rgba(229,184,105,0.6)]' : 'bg-zinc-600'
                  }`}
                  style={{
                    transform: `scaleY(${scale})`,
                    opacity: isSpeaking ? 0.95 : 0.35,
                  }}
                />
              );
            })}
          </div>

          {/* Reserved Fixed-Height Slot for Status Pill (h-9, Zero Layout Shift) */}
          <div className="h-9 mt-3 flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-xs text-zinc-300 transition-all duration-300">
              <span
                className={`w-1.5 h-1.5 rounded-full ${dotColor} ${
                  dotPulse ? 'animate-pulse' : ''
                }`}
              />
              <span>{statusText}</span>
            </div>
          </div>

          {/* Reserved Fixed-Height Slot for [Space] Done Speaking Button (h-10, Zero Layout Shift) */}
          <div className="h-10 mt-2 flex items-center justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isActive && !isSpeaking && canFinishTurn) {
                  onDoneSpeaking?.();
                }
              }}
              className={`px-3.5 py-1.5 rounded-full bg-[#E5B869]/15 hover:bg-[#E5B869]/25 border border-[#E5B869]/35 hover:border-[#E5B869]/60 text-xs text-[#F7E3B5] flex items-center gap-2 transition-opacity duration-300 shadow-lg cursor-pointer group/done ${
                isActive && !isSpeaking && canFinishTurn && onDoneSpeaking
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none'
              }`}
              title="Signal to panelist that you are finished speaking (Shortcut: Space)"
            >
              <span className="px-1.5 py-0.5 rounded bg-zinc-950/90 border border-[#E5B869]/40 font-mono text-[10px] font-semibold text-[#F7E3B5] shadow-inner">
                Space
              </span>
              <span className="font-medium">Press Space or click when done speaking</span>
              <CornerDownLeft className="w-3.5 h-3.5 text-[#E5B869] group-hover/done:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Bottom-Left Nameplate: Full Name, Title, and Role Description */}
        <div className="absolute bottom-4 left-4 max-w-[calc(100%-32px)] z-20 pointer-events-auto">
          <div className="px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 flex flex-col gap-0.5 shadow-xl">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100 truncate">
                {panelist.name}
              </span>
              <span className="text-zinc-600 text-xs">·</span>
              <span className="text-xs font-medium text-zinc-300">
                {details.title}
              </span>
              <div className="ml-2 pl-2 border-l border-white/15 flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-mono text-zinc-400 tracking-wider">
                  Q:
                </span>
                {renderProgressDots('w-2 h-2')}
              </div>
            </div>
            <span className="text-[11px] text-zinc-400 truncate max-w-lg">
              {details.subtitle}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. GRID VARIANT (Standard 2x2 grid tile)
  // ---------------------------------------------------------------------------
  return (
    <div
      className={`relative rounded-2xl bg-zinc-900/70 border flex flex-col items-center justify-center overflow-hidden transition-all duration-300 w-full h-full group ${
        isActive
          ? 'border-[#E5B869]/60 ring-1 ring-[#E5B869]/20'
          : 'border-white/[0.07] hover:border-white/20'
      }`}
    >
      {/* Top-Left: Note-Taking Hint if present */}
      {!isActive && noteTakingHint && (
        <div className="absolute top-3 left-3 text-[11px] text-zinc-300 bg-black/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 animate-fade-in z-20 shadow-md">
          <PenLine className="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
          <span className="truncate max-w-[140px] text-[10px] text-zinc-300">{noteTakingHint}</span>
        </div>
      )}

      {/* Top-Right: Audio Indicator / Pass Mic Button */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
        {canPassMic && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPassMic?.();
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-2.5 py-1 rounded-lg bg-zinc-800/90 hover:bg-zinc-700/90 text-[11px] text-zinc-200 border border-white/10 flex items-center gap-1 shadow-md cursor-pointer backdrop-blur-sm"
            title={`Pass mic to ${panelist.name}`}
          >
            <span>{isActive ? 'Next Seat' : 'Pass Mic'}</span>
            <ArrowRight className="w-3 h-3 text-zinc-400" strokeWidth={1.5} />
          </button>
        )}

        {/* Audio Level Pill */}
        {isActive ? (
          isSpeaking ? (
            <div
              className="flex items-end gap-0.5 h-6 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-[#E5B869]/30 shadow-sm"
              title="Speaking"
            >
              {[0.6, 1.2, 0.8].map((factor, i) => {
                const scale = Math.max(0.25, Math.min(1.0, 0.25 + audioLevel * factor * 0.75));
                return (
                  <span
                    key={i}
                    className="w-1 h-3.5 bg-[#E5B869] rounded-full origin-bottom transition-transform duration-150 ease-out will-change-transform shadow-[0_0_6px_rgba(229,184,105,0.5)]"
                    style={{ transform: `scaleY(${scale})` }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 text-[11px] text-zinc-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E5B869]" />
              <Volume2 className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
            </div>
          )
        ) : null}
      </div>

      {/* Center of Tile: Avatar & Concentric Audio Ripple Rings */}
      <div className="relative flex items-center justify-center">
        {isActive && isSpeaking && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className="absolute rounded-full border border-[#E5B869]/35 transition-transform duration-75 shadow-[0_0_12px_rgba(229,184,105,0.2)]"
              style={{
                width: `${80 + Math.min(60, audioLevel * 90)}px`,
                height: `${80 + Math.min(60, audioLevel * 90)}px`,
                opacity: Math.max(0.2, Math.min(0.9, audioLevel * 1.2)),
              }}
            />
            <span
              className="absolute rounded-full border border-[#E5B869]/20 transition-transform duration-75"
              style={{
                width: `${110 + Math.min(80, audioLevel * 130)}px`,
                height: `${110 + Math.min(80, audioLevel * 130)}px`,
                opacity: Math.max(0.1, Math.min(0.6, audioLevel * 0.8)),
              }}
            />
          </div>
        )}

        <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full bg-zinc-800/90 border flex items-center justify-center text-lg md:text-xl font-medium tracking-wider text-zinc-100 shadow-inner z-10 select-none ${
          isActive ? 'border-[#E5B869]/40' : 'border-white/10'
        }`}>
          {panelist.avatarInitials}
        </div>
      </div>

      {/* Bottom-Left: Google Meet Nameplate */}
      <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-lg bg-black/50 backdrop-blur-md border border-white/[0.06] flex items-center justify-between gap-3 max-w-[calc(100%-24px)] pointer-events-auto z-20">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-100 truncate">
              {panelist.name}
            </span>
            {renderProgressDots('w-1.5 h-1.5')}
          </div>
          <span className="text-[11px] text-zinc-400 truncate">
            {details.shortRole} · Seat {panelist.seat}
          </span>
        </div>
      </div>
    </div>
  );
}
