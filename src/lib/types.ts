export type PanelSeatId = 1 | 2 | 3 | 4;

export type VoiceName = 'Charon' | 'Fenrir' | 'Kore' | 'Puck';

export interface CandidateProfile {
  name: string;
  degree: string;
  stream: string;
  graduationYear: string;
  hometown: string;
  state: string;
  careerStatus: 'fresher' | 'gap' | 'working';
  gapOrWorkDetails: string;
  hobbies: string;
  languagePref: 'english' | 'hinglish' | 'hindi';
  sessionMode: 'quick' | 'full';
  targetExam: 'IBPS PO' | 'SBI PO';
  resumeHighlights?: string;
}

export interface PanelistConfig {
  seat: PanelSeatId;
  name: string;
  title: string;
  roleFocus: string;
  age: number;
  voiceName: VoiceName;
  avatarInitials: string;
  accentColor: string;
  bio: string;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'panelist' | 'candidate' | 'system';
  seat?: PanelSeatId;
  speakerName: string;
  text: string;
  timestamp: number;
}

export interface PreInterviewDossier {
  hometownFacts: string[];
  degreeCrossQuestions: string[];
  currentBankingTopics: string[];
  rbiQuickRef: string;
  roundNumber?: number;
  avoidedQuestions?: string[];
  seatAngles?: {
    seat1: string;
    seat2: string;
    seat3: string;
    seat4: string;
  };
}

export interface EvaluationReport {
  overallScore: number;
  verdict: 'Selected (High Merit)' | 'Selected (Borderline)' | 'Waitlisted' | 'Needs Improvement';
  categoryScores: {
    bankingAwareness: { score: number; max: 30; note: string };
    personalProfileConviction: { score: number; max: 25; note: string };
    situationalOfficerQualities: { score: number; max: 20; note: string };
    honestyAntiBluff: { score: number; max: 15; note: string; bluffsDetected: string[] };
    communicationAndBodyLanguage: { score: number; max: 10; note: string; webcamObservations: string[] };
  };
  questionByQuestion: Array<{
    question: string;
    askedBy: string;
    candidateAnswer: string;
    scoreOutOf10: number;
    critique: string;
    idealModelAnswer: string;
  }>;
  topStrengths: string[];
  actionItems: string[];
}
