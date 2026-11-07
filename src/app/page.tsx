'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CandidateProfile,
  PreInterviewDossier,
} from '@/lib/types';
import {
  SAMPLE_PROFILES,
} from '@/lib/rbi-factsheet';
import {
  Key,
  BookOpen,
  ArrowRight,
  Upload,
  Check,
  AlertCircle,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  SlidersHorizontal,
  FileText,
  Ticket,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  // Candidate Profile State
  const [profile, setProfile] = useState<CandidateProfile>({
    name: 'Aarav Sharma',
    targetExam: 'IBPS PO',
    degree: 'B.Tech',
    stream: 'Computer Science & Engineering',
    graduationYear: '2024',
    hometown: 'Jaipur',
    state: 'Rajasthan',
    careerStatus: 'gap',
    gapOrWorkDetails: '1-year study gap preparing for banking and civil services exams.',
    hobbies: 'Chess, competitive coding, fintech and digital rupee trends',
    languagePref: 'hinglish',
    sessionMode: 'full',
    resumeHighlights: 'Led college robotics club; built mini UPI simulator project.',
  });

  // View Mode: 'bio' (Natural language Mad-Libs / Boarding Pass) vs 'grid' (Traditional 4-row form)
  const [viewMode, setViewMode] = useState<'bio' | 'grid'>('bio');

  // Resume Auto-Fill State
  const [showResumeDrawer, setShowResumeDrawer] = useState(false);
  const [resumeText, setResumeText] = useState('');
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [resumeParseSuccess, setResumeParseSuccess] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // Settings & Reference Modals
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [keySavedToast, setKeySavedToast] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  // Entering Interview Room State
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparationStep, setPreparationStep] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load custom key from localStorage on mount
  useEffect(() => {
    const savedKey = localStorage.getItem('ibps_gemini_api_key');
    if (savedKey) {
      setGeminiApiKey(savedKey);
    }
  }, []);

  const handleSaveApiKey = () => {
    if (geminiApiKey.trim()) {
      localStorage.setItem('ibps_gemini_api_key', geminiApiKey.trim());
    } else {
      localStorage.removeItem('ibps_gemini_api_key');
    }
    setKeySavedToast(true);
    setTimeout(() => setKeySavedToast(false), 2000);
    setApiKeyModalOpen(false);
  };

  const handleApplyPreset = (preset: CandidateProfile) => {
    setProfile(preset);
  };

  const handleAutoFillFromResume = async () => {
    if (!resumeText.trim()) {
      setResumeError('Please paste your resume or biographical summary first.');
      return;
    }

    try {
      setIsParsingResume(true);
      setResumeError(null);
      setResumeParseSuccess(false);

      const customKey = localStorage.getItem('ibps_gemini_api_key');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customKey) {
        headers['x-gemini-api-key'] = customKey;
      }

      const res = await fetch('/api/dossier', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'parse_resume',
          resumeText,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to auto-fill DAF from resume');
      }

      const data = await res.json();
      if (data.extractedProfile) {
        setProfile((prev) => ({
          ...prev,
          ...data.extractedProfile,
          resumeHighlights: data.resumeHighlights || prev.resumeHighlights,
        }));
        setResumeParseSuccess(true);
      }
    } catch (err: unknown) {
      console.error(err);
      setResumeError(err instanceof Error ? err.message : 'Error extracting resume info');
    } finally {
      setIsParsingResume(false);
    }
  };

  const handleEnterInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!profile.name.trim() || !profile.degree.trim() || !profile.hometown.trim()) {
      setErrorMessage('Please fill in your Name, Degree, and Hometown.');
      return;
    }

    try {
      setIsPreparing(true);
      setPreparationStep('Saving candidate profile...');

      // 1. Store profile in sessionStorage
      sessionStorage.setItem('ibps_candidate_profile', JSON.stringify(profile));

      setPreparationStep('Panelists reviewing profile & generating dossier...');

      const customKey = localStorage.getItem('ibps_gemini_api_key');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customKey) {
        headers['x-gemini-api-key'] = customKey;
      }

      const res = await fetch('/api/dossier', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'generate_dossier',
          profile,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate boardroom dossier');
      }

      const data = await res.json();
      const dossier: PreInterviewDossier = data.dossier;

      // 2. Store dossier in sessionStorage
      sessionStorage.setItem('ibps_dossier', JSON.stringify(dossier));

      // 3. Navigate to boardroom
      router.push('/room');
    } catch (err: unknown) {
      console.error(err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to initialize boardroom. Please verify your Gemini API key.'
      );
      setIsPreparing(false);
    }
  };

  const isPresetActive = (sample: CandidateProfile) => {
    return profile.name === sample.name && profile.degree === sample.degree;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-white selection:text-zinc-950">
      {/* Top Understated Navigation Bar */}
      <header className="h-14 border-b border-white/[0.07] bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rotate-45 bg-[#E5B869] shadow-[0_0_10px_rgba(229,184,105,0.5)] shrink-0 inline-block" />
            <span className="text-base font-semibold tracking-tight text-white">
              Merit
            </span>
            <span className="text-xs text-zinc-500 font-normal">
              IBPS &amp; SBI PO
            </span>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCheatSheetOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-300 text-xs transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
              <span className="hidden sm:inline">RBI Reference</span>
              <span className="sm:hidden">Reference</span>
            </button>

            <button
              type="button"
              onClick={() => setApiKeyModalOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-850 hover:border-zinc-700 text-zinc-300 text-xs transition-colors cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
              <span>{geminiApiKey ? 'API Key Configured' : 'API Key'}</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  geminiApiKey ? 'bg-emerald-400' : 'bg-zinc-600'
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col justify-center">
        {/* Hero Section */}
        <div className="text-center max-w-xl mx-auto mb-6 space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-medium text-zinc-100 tracking-tight">
            Mock Interview Board
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Live four-member voice panel for IBPS and SBI Probationary Officer interviews.
          </p>
        </div>

        {/* Tactile Interactive Candidate Bio / Boarding Pass Setup Card (max-w-2xl mx-auto) */}
        <div className="max-w-2xl w-full mx-auto rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-5 sm:p-6 backdrop-blur-md shadow-2xl space-y-5">
          {/* Top Bar of Card */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.07] text-xs">
            {/* Left: Persona Tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-zinc-500 font-medium mr-0.5">Personas:</span>
              <button
                type="button"
                onClick={() => handleApplyPreset(SAMPLE_PROFILES[0])}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer border ${
                  isPresetActive(SAMPLE_PROFILES[0])
                    ? 'bg-[#E5B869]/15 text-[#F7E3B5] border-[#E5B869]/35 shadow-xs'
                    : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800/80'
                }`}
              >
                Aarav · B.Tech
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(SAMPLE_PROFILES[1])}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer border ${
                  isPresetActive(SAMPLE_PROFILES[1])
                    ? 'bg-[#E5B869]/15 text-[#F7E3B5] border-[#E5B869]/35 shadow-xs'
                    : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800/80'
                }`}
              >
                Priya · B.Com
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(SAMPLE_PROFILES[2])}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer border ${
                  isPresetActive(SAMPLE_PROFILES[2])
                    ? 'bg-[#E5B869]/15 text-[#F7E3B5] border-[#E5B869]/35 shadow-xs'
                    : 'bg-zinc-950/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800/80'
                }`}
              >
                Rohan · Work-Ex
              </button>
            </div>

            {/* Right: Import resume + subtle view toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowResumeDrawer(!showResumeDrawer)}
                className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-zinc-800/60 transition-colors cursor-pointer text-xs shrink-0"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
                <span>Import resume</span>
                {showResumeDrawer ? (
                  <ChevronUp className="w-3 h-3 text-zinc-500" strokeWidth={1.5} />
                ) : (
                  <ChevronDown className="w-3 h-3 text-zinc-500" strokeWidth={1.5} />
                )}
              </button>

              <span className="text-zinc-700">|</span>

              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'bio' ? 'grid' : 'bio')}
                className="text-zinc-400 hover:text-zinc-200 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-zinc-800/60 transition-colors cursor-pointer text-xs shrink-0"
              >
                {viewMode === 'bio' ? (
                  <>
                    <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
                    <span>Edit fields</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
                    <span>Bio view</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Collapsible Resume Extraction Drawer */}
          {showResumeDrawer && (
            <div className="p-3.5 rounded-xl border border-zinc-800/90 bg-zinc-950/70 space-y-2.5 text-xs animate-fade-in">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="font-medium text-zinc-300">Paste resume or bio summary:</span>
                <span className="text-[11px] text-zinc-500">Gemini Flash extraction</span>
              </div>
              <textarea
                rows={3}
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                placeholder="Paste key bullets or bio here (e.g. 'B.Tech CSE 2024 from MNIT Jaipur, 1 year gap preparing for banking, interested in fintech and chess...')"
                className="w-full rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none p-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 transition-colors font-sans"
              />
              <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleAutoFillFromResume}
                  disabled={isParsingResume}
                  className="px-3 py-1.5 rounded-lg bg-zinc-200 hover:bg-white text-zinc-950 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isParsingResume ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-zinc-800" strokeWidth={1.5} />
                  )}
                  <span>{isParsingResume ? 'Extracting...' : 'Extract with Gemini Flash'}</span>
                </button>

                {resumeParseSuccess && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                    Profile updated
                  </span>
                )}
                {resumeError && (
                  <span className="text-xs text-rose-400 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                    {resumeError}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Form wrapper */}
          <form onSubmit={handleEnterInterview} className="space-y-5">
            {viewMode === 'bio' ? (
              /* Mad-Libs / Boarding Pass View */
              <div className="space-y-3">
                {/* Boarding Pass Micro-Header */}
                <div className="flex items-center justify-between px-1 text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-3.5 h-3.5 text-zinc-400" strokeWidth={1.5} />
                    <span className="text-zinc-300 font-medium">Candidate Boarding Pass · Admit Card</span>
                  </div>
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Boardroom 04</span>
                  </div>
                </div>

                {/* Natural-Language Mad-Libs Paragraph */}
                <div className="text-[17px] md:text-[19px] leading-[2.1] text-zinc-400 font-normal p-6 rounded-xl bg-zinc-950/60 border border-white/[0.06]">
                  <span>I&apos;m </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <input
                      type="text"
                      required
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      placeholder="Candidate name"
                      size={Math.max(profile.name.length || 14, 4)}
                      className="bg-transparent text-[#F7E3B5] placeholder:text-zinc-500 focus:outline-none text-[16px] md:text-[18px] font-medium"
                    />
                  </span>
                  <span>, preparing for the </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <select
                      value={profile.targetExam}
                      onChange={(e) => setProfile({ ...profile, targetExam: e.target.value as 'IBPS PO' | 'SBI PO' })}
                      className="bg-transparent text-[#F7E3B5] font-medium focus:outline-none cursor-pointer pr-1 text-[16px] md:text-[18px]"
                    >
                      <option value="IBPS PO" className="bg-zinc-900 text-zinc-100">IBPS PO</option>
                      <option value="SBI PO" className="bg-zinc-900 text-zinc-100">SBI PO</option>
                    </select>
                  </span>
                  <span> interview. I graduated in </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <input
                      type="text"
                      value={profile.graduationYear}
                      onChange={(e) => setProfile({ ...profile, graduationYear: e.target.value })}
                      placeholder="2024"
                      size={Math.max(profile.graduationYear.length || 4, 4)}
                      className="bg-transparent text-[#F7E3B5] placeholder:text-zinc-500 focus:outline-none text-[16px] md:text-[18px] font-medium font-mono"
                    />
                  </span>
                  <span> with a </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <input
                      type="text"
                      required
                      value={profile.degree}
                      onChange={(e) => setProfile({ ...profile, degree: e.target.value })}
                      placeholder="B.Tech"
                      size={Math.max(profile.degree.length || 6, 4)}
                      className="bg-transparent text-[#F7E3B5] placeholder:text-zinc-500 focus:outline-none text-[16px] md:text-[18px] font-medium"
                    />
                  </span>
                  <span> in </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <input
                      type="text"
                      required
                      value={profile.stream}
                      onChange={(e) => setProfile({ ...profile, stream: e.target.value })}
                      placeholder="Computer Science & Engineering"
                      size={Math.min(32, Math.max(profile.stream.length || 18, 8))}
                      className="bg-transparent text-[#F7E3B5] placeholder:text-zinc-500 focus:outline-none text-[16px] md:text-[18px] font-medium"
                    />
                  </span>
                  <span> and come from </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <input
                      type="text"
                      required
                      value={profile.hometown}
                      onChange={(e) => setProfile({ ...profile, hometown: e.target.value })}
                      placeholder="Jaipur"
                      size={Math.max(profile.hometown.length || 6, 4)}
                      className="bg-transparent text-[#F7E3B5] placeholder:text-zinc-500 focus:outline-none text-[16px] md:text-[18px] font-medium"
                    />
                  </span>
                  <span>, </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <input
                      type="text"
                      required
                      value={profile.state}
                      onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                      placeholder="Rajasthan"
                      size={Math.max(profile.state.length || 9, 4)}
                      className="bg-transparent text-[#F7E3B5] placeholder:text-zinc-500 focus:outline-none text-[16px] md:text-[18px] font-medium"
                    />
                  </span>
                  <span>. Currently </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <select
                      value={profile.careerStatus}
                      onChange={(e) => setProfile({ ...profile, careerStatus: e.target.value as 'fresher' | 'gap' | 'working' })}
                      className="bg-transparent text-[#F7E3B5] font-medium focus:outline-none cursor-pointer pr-1 text-[16px] md:text-[18px]"
                    >
                      <option value="fresher" className="bg-zinc-900 text-zinc-100">a fresher</option>
                      <option value="gap" className="bg-zinc-900 text-zinc-100">on a gap year</option>
                      <option value="working" className="bg-zinc-900 text-zinc-100">working</option>
                    </select>
                  </span>
                  <span> (</span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <input
                      type="text"
                      value={profile.gapOrWorkDetails}
                      onChange={(e) => setProfile({ ...profile, gapOrWorkDetails: e.target.value })}
                      placeholder="e.g. 1-year exam preparation"
                      size={Math.min(38, Math.max(profile.gapOrWorkDetails.length || 18, 8))}
                      className="bg-transparent text-[#F7E3B5] placeholder:text-zinc-500 focus:outline-none text-[16px] md:text-[18px] font-medium"
                    />
                  </span>
                  <span>), and outside work I enjoy </span>
                  <span className="inline-block bg-[#E5B869]/[0.08] hover:bg-[#E5B869]/[0.14] focus-within:bg-[#E5B869]/[0.16] focus-within:ring-1 focus-within:ring-[#E5B869]/50 text-[#F7E3B5] font-medium px-2.5 py-0.5 mx-0.5 rounded-md border border-[#E5B869]/25 transition align-baseline">
                    <input
                      type="text"
                      value={profile.hobbies}
                      onChange={(e) => setProfile({ ...profile, hobbies: e.target.value })}
                      placeholder="e.g. Chess, reading, fintech"
                      size={Math.min(36, Math.max(profile.hobbies.length || 18, 8))}
                      className="bg-transparent text-[#F7E3B5] placeholder:text-zinc-500 focus:outline-none text-[16px] md:text-[18px] font-medium"
                    />
                  </span>
                  <span>.</span>
                </div>
              </div>
            ) : (
              /* Traditional 4-Row Grid View */
              <div className="space-y-4 animate-fade-in">
                {/* Row 1: Full name + Exam */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Full name
                    </label>
                    <input
                      type="text"
                      required
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      placeholder="e.g. Aman Sharma"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors"
                    />
                  </div>

                  <div className="space-y-1 sm:w-44">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Exam
                    </label>
                    <div className="grid grid-cols-2 gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg h-[38px] items-center">
                      <button
                        type="button"
                        onClick={() => setProfile({ ...profile, targetExam: 'IBPS PO' })}
                        className={`h-full text-xs rounded transition-colors cursor-pointer ${
                          profile.targetExam === 'IBPS PO'
                            ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        IBPS PO
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfile({ ...profile, targetExam: 'SBI PO' })}
                        className={`h-full text-xs rounded transition-colors cursor-pointer ${
                          profile.targetExam === 'SBI PO'
                            ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        SBI PO
                      </button>
                    </div>
                  </div>
                </div>

                {/* Row 2: Education (Degree + Stream/Major + Year) */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="sm:w-28 space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Degree
                    </label>
                    <input
                      type="text"
                      required
                      value={profile.degree}
                      onChange={(e) => setProfile({ ...profile, degree: e.target.value })}
                      placeholder="B.Tech"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors"
                    />
                  </div>

                  <div className="flex-1 space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Stream / Major
                    </label>
                    <input
                      type="text"
                      required
                      value={profile.stream}
                      onChange={(e) => setProfile({ ...profile, stream: e.target.value })}
                      placeholder="Computer Science & Engineering"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors"
                    />
                  </div>

                  <div className="sm:w-24 space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Year
                    </label>
                    <input
                      type="text"
                      value={profile.graduationYear}
                      onChange={(e) => setProfile({ ...profile, graduationYear: e.target.value })}
                      placeholder="2024"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors font-mono"
                    />
                  </div>
                </div>

                {/* Row 3: Location & Status (Hometown + State + Experience Status) */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Hometown
                    </label>
                    <input
                      type="text"
                      required
                      value={profile.hometown}
                      onChange={(e) => setProfile({ ...profile, hometown: e.target.value })}
                      placeholder="Jaipur"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors"
                    />
                  </div>

                  <div className="flex-1 space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      State
                    </label>
                    <input
                      type="text"
                      required
                      value={profile.state}
                      onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                      placeholder="Rajasthan"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors"
                    />
                  </div>

                  <div className="sm:w-52 space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Experience
                    </label>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg h-[38px] items-center">
                      <button
                        type="button"
                        onClick={() => setProfile({ ...profile, careerStatus: 'fresher' })}
                        className={`h-full text-xs rounded transition-colors cursor-pointer ${
                          profile.careerStatus === 'fresher'
                            ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Fresher
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfile({ ...profile, careerStatus: 'gap' })}
                        className={`h-full text-xs rounded transition-colors cursor-pointer ${
                          profile.careerStatus === 'gap'
                            ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Gap year
                      </button>
                      <button
                        type="button"
                        onClick={() => setProfile({ ...profile, careerStatus: 'working' })}
                        className={`h-full text-xs rounded transition-colors cursor-pointer ${
                          profile.careerStatus === 'working'
                            ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Working
                      </button>
                    </div>
                  </div>
                </div>

                {/* Row 4: Context (Work/gap details + Hobbies) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Work or gap details
                    </label>
                    <input
                      type="text"
                      value={profile.gapOrWorkDetails}
                      onChange={(e) => setProfile({ ...profile, gapOrWorkDetails: e.target.value })}
                      placeholder="1-year preparation gap for banking exams"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[13px] font-medium text-zinc-300">
                      Hobbies &amp; interests
                    </label>
                    <input
                      type="text"
                      value={profile.hobbies}
                      onChange={(e) => setProfile({ ...profile, hobbies: e.target.value })}
                      placeholder="Chess, fintech trends, cycling"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900/70 border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" strokeWidth={1.5} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Bottom Footer of Card */}
            <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
              {/* Left: Clean segmented pills for Language & Session */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Language pills */}
                <div className="flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, languagePref: 'english' })}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      profile.languagePref === 'english'
                        ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, languagePref: 'hinglish' })}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      profile.languagePref === 'hinglish'
                        ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Hinglish
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, languagePref: 'hindi' })}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      profile.languagePref === 'hindi'
                        ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    Hindi
                  </button>
                </div>

                {/* Session Duration pills */}
                <div className="flex items-center p-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, sessionMode: 'quick' })}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      profile.sessionMode === 'quick'
                        ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    8 min
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfile({ ...profile, sessionMode: 'full' })}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      profile.sessionMode === 'full'
                        ? 'bg-[#E5B869]/15 text-[#F7E3B5] border border-[#E5B869]/35 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    15 min
                  </button>
                </div>
              </div>

              {/* Right: Signature Warm Brushed Gold primary CTA button */}
              <button
                type="submit"
                disabled={isPreparing}
                className="px-5 py-2.5 rounded-lg bg-[#E5B869] hover:bg-[#ecd094] text-zinc-950 text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-[0_0_25px_rgba(229,184,105,0.25)] active:scale-[0.99] disabled:opacity-50"
              >
                {isPreparing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-950" strokeWidth={1.5} />
                    <span>Preparing panel...</span>
                  </>
                ) : (
                  <>
                    <span>Start interview</span>
                    <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                  </>
                )}
              </button>
            </div>

            {/* Preparation step text */}
            {isPreparing && (
              <p className="text-xs text-zinc-400 text-center animate-pulse pt-1">
                {preparationStep}
              </p>
            )}
          </form>
        </div>

        {/* Subtle 1-line footnote below card */}
        <p className="text-center text-xs text-zinc-500 font-normal mt-4">
          Panel: R.K. Deshmukh (Chairman) · S. Narayanan (RBI) · Dr. K. Verma (Economy) · R. Rao (HR)
        </p>
      </main>

      {/* API Key Modal */}
      {apiKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-zinc-100 text-sm font-medium">
                <Key className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                <span>Gemini API Key</span>
              </div>
              <button
                onClick={() => setApiKeyModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed font-sans">
              Enter your Gemini API key below. If omitted, the server environment key will be used.
              Saved only inside your local browser storage.
            </p>

            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-zinc-300">
                Key String
              </label>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setApiKeyModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveApiKey}
                className="px-4 py-1.5 rounded-lg bg-white text-zinc-950 hover:bg-zinc-200 font-medium text-xs transition-colors cursor-pointer"
              >
                Save Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Saved Toast */}
      {keySavedToast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 text-xs shadow-xl flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
          <span>API Key saved locally.</span>
        </div>
      )}

      {/* RBI Reference Modal */}
      {cheatSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-4 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-zinc-100 text-sm font-medium">
                <BookOpen className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                <span>RBI &amp; Banking Standards (2026 Reference)</span>
              </div>
              <button
                onClick={() => setCheatSheetOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-3 text-xs text-zinc-300 leading-relaxed font-sans">
              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-xs font-semibold text-zinc-200 block">
                  Monetary Policy Rates (2026 LAF Corridor)
                </span>
                <p className="font-mono text-zinc-400 text-[11px] tabular-nums">
                  Repo: 6.50% · SDF: 6.25% · MSF: 6.75% · Bank Rate: 6.75% · CRR: 4.50% · SLR: 18.00%
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-xs font-semibold text-zinc-200 block">
                  Priority Sector Lending (PSL Norms)
                </span>
                <p className="text-zinc-400 text-xs">
                  Overall Target: 40% of ANBC. Agriculture: 18% (Small &amp; Marginal Farmers 10%),
                  Micro Enterprises: 7.5%, Weaker Sections: 12%. Deficit diverted to RIDF/NABARD.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-xs font-semibold text-zinc-200 block">
                  NPA Norms &amp; Asset Classification
                </span>
                <p className="text-zinc-400 text-xs">
                  Term loan overdue &gt; 90 days = NPA. SMA-0 (1–30d), SMA-1 (31–60d), SMA-2 (61–90d).
                  Substandard (15% prov), Doubtful D1 (25%), D2 (40%), D3 (100%), Loss (100%).
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-xs font-semibold text-zinc-200 block">
                  Stressed Asset Recovery &amp; DICGC
                </span>
                <p className="text-zinc-400 text-xs">
                  SARFAESI Act 2002 (collateral enforcement without court &gt; ₹1L), IBC 2016 (NCLT 180+90d),
                  DRT (&ge; ₹20L), Lok Adalats (&le; ₹20L). DICGC covers up to ₹5,00,000 per depositor.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
                <span className="text-xs font-semibold text-zinc-200 block">
                  Flagship Financial Inclusion Schemes
                </span>
                <p className="text-zinc-400 text-xs">
                  PMJDY (zero balance, RuPay, ₹10,000 OD), PMMY Mudra (Shishu up to ₹50k, Kishore ₹50k–₹5L,
                  Tarun ₹5L–₹10L/₹20L), PM Vishwakarma (18 trades, ₹15k kit, ₹1L+₹2L @ 5%).
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setCheatSheetOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
              >
                Close Reference
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
