import { NextResponse } from 'next/server';
import { extractApiKeyFromRequest, getGeminiClient } from '@/lib/gemini-server';
import { CandidateProfile, EvaluationReport, TranscriptEntry } from '@/lib/types';
import { RBI_FACTSHEET_TEXT } from '@/lib/rbi-factsheet';

interface EvaluateRequestBody {
  profile: CandidateProfile;
  transcript: TranscriptEntry[];
  webcamSnapshots?: string[]; // Array of base64 data URLs (e.g. data:image/jpeg;base64,...)
}

interface InterviewExchange {
  seat?: number;
  askedBy: string;
  questionText: string;
  candidateParts: string[];
  candidateVerbatimAnswer: string;
}

function isHandoverOrClosingRemark(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const hasHandoverPhrase =
    /\b(take over|pass(?:ing)? (?:the )?(?:mic|baton|floor)|hand(?:ing)? over|over to (?:you|shri|dr|mr|ms|mrs|seat)|that(?:'s| will be) all from (?:my|our) side|leave the room|all the best|interview (?:is )?(?:now )?concluded|would you like to take)\b/i.test(
      trimmed
    );
  return hasHandoverPhrase || !trimmed.includes('?');
}

function buildStructuredExchanges(transcript: TranscriptEntry[]): InterviewExchange[] {
  const exchanges: InterviewExchange[] = [];
  let current: InterviewExchange | null = null;

  for (const entry of transcript) {
    const text = (entry.text || '').trim();
    if (!text) continue;
    if (entry.speaker === 'system') {
      current = null;
      continue;
    }

    if (entry.speaker === 'panelist') {
      if (
        current &&
        current.candidateParts.length === 0 &&
        current.seat === entry.seat &&
        current.askedBy === entry.speakerName
      ) {
        current.questionText = `${current.questionText} ${text}`.trim();
      } else {
        current = {
          seat: entry.seat,
          askedBy: entry.speakerName || 'Panelist',
          questionText: text,
          candidateParts: [],
          candidateVerbatimAnswer: '',
        };
        exchanges.push(current);
      }
    } else if (entry.speaker === 'candidate') {
      if (!current) {
        current = {
          askedBy: 'Board Panel',
          questionText: '(Opening interaction)',
          candidateParts: [],
          candidateVerbatimAnswer: '',
        };
        exchanges.push(current);
      }
      current.candidateParts.push(text);
    }
  }

  const answeredKeys = new Set<string>();
  for (const ex of exchanges) {
    ex.candidateVerbatimAnswer = ex.candidateParts.join(' ').trim();
    if (ex.candidateVerbatimAnswer.length > 0) {
      answeredKeys.add(`${ex.seat ?? ''}:${ex.askedBy}`);
    }
  }

  return exchanges.filter((ex) => {
    if (ex.candidateVerbatimAnswer.length > 0) return true;
    const seatKey = `${ex.seat ?? ''}:${ex.askedBy}`;
    if (answeredKeys.has(seatKey)) return false;
    if (isHandoverOrClosingRemark(ex.questionText)) return false;
    return true;
  });
}

function computeVerdict(score: number): EvaluationReport['verdict'] {
  if (score >= 80) return 'Selected (High Merit)';
  if (score >= 65) return 'Selected (Borderline)';
  if (score >= 50) return 'Waitlisted';
  return 'Needs Improvement';
}

function cleanJsonString(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

export async function POST(request: Request) {
  try {
    const customKey = extractApiKeyFromRequest(request);
    const { client } = getGeminiClient(customKey);
    const body: EvaluateRequestBody = await request.json();

    const { profile, transcript, webcamSnapshots } = body;

    if (!profile) {
      return NextResponse.json({ error: 'Candidate profile is required' }, { status: 400 });
    }

    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      return NextResponse.json(
        { error: 'A transcript with interview dialogue is required for evaluation' },
        { status: 400 }
      );
    }

    const exchanges = buildStructuredExchanges(transcript);
    const totalExchanges = exchanges.length;
    const answeredExchanges = exchanges.filter(
      (ex) => ex.candidateVerbatimAnswer.length > 0
    ).length;
    const totalCandidateWords = transcript
      .filter((entry) => entry.speaker === 'candidate')
      .reduce(
        (sum, entry) =>
          sum + (entry.text || '').trim().split(/\s+/).filter(Boolean).length,
        0
      );

    // Deterministic zero-score report when no candidate responses were recorded
    if (answeredExchanges === 0 || totalCandidateWords === 0) {
      const zeroReport: EvaluationReport = {
        overallScore: 0,
        verdict: 'Needs Improvement',
        categoryScores: {
          bankingAwareness: {
            score: 0,
            max: 30,
            note: 'No candidate responses were recorded to assess banking awareness or RBI knowledge.',
          },
          personalProfileConviction: {
            score: 0,
            max: 25,
            note: 'No candidate responses were recorded to evaluate profile conviction or career rationale.',
          },
          situationalOfficerQualities: {
            score: 0,
            max: 20,
            note: 'No candidate responses were recorded for situational judgment or branch scenarios.',
          },
          honestyAntiBluff: {
            score: 0,
            max: 15,
            note: 'No spoken or typed answers were recorded in this session.',
            bluffsDetected: [],
          },
          communicationAndBodyLanguage: {
            score: 0,
            max: 10,
            note: 'No verbal answers were recorded during the interview.',
            webcamObservations: [],
          },
        },
        questionByQuestion: exchanges.map((ex) => ({
          question: ex.questionText,
          askedBy: ex.askedBy,
          candidateAnswer: '(No response provided by candidate)',
          scoreOutOf10: 0,
          critique: 'No verbal or typed response was recorded from the candidate for this question.',
          idealModelAnswer:
            'Address the panelist respectfully, answer directly with concrete banking or personal context, and press Space / Done Speaking when finished.',
        })),
        topStrengths: ['No verbal or typed candidate responses were recorded to identify strengths.'],
        actionItems: [
          'Verify your microphone permissions and audio input level indicator in the self-view tile before starting.',
          'Speak clearly after the panelist finishes, then press Space or click "Done Speaking" (or use the Chat text fallback) to log your answer.',
          'Complete questions across all four panel seats so the board can grade your full IBPS PO readiness.',
        ],
      };

      return NextResponse.json({
        success: true,
        report: zeroReport,
      });
    }

    const structuredExchangesText =
      exchanges.length > 0
        ? exchanges
            .map(
              (ex, idx) =>
                `Exchange ${idx + 1} (${ex.askedBy}${ex.seat ? `, Seat ${ex.seat}` : ''}):\n` +
                `  Panelist Question: ${ex.questionText}\n` +
                `  Candidate Verbatim Answer: ${
                  ex.candidateVerbatimAnswer || '[NO ANSWER PROVIDED BY CANDIDATE]'
                }`
            )
            .join('\n\n')
        : transcript.map((entry) => `[${entry.speakerName}]: ${entry.text}`).join('\n\n');

    const evaluationPrompt = `
You are the Grand Assessment Committee of the Institute of Banking Personnel Selection (IBPS) and State Bank of India (SBI PO).
You are conducting a strict, rigorous, and constructive viva voce evaluation for a Probationary Officer candidate.

REFERENCE RBI & BANKING BENCHMARKS (Use ONLY to verify whether facts the candidate actually spoke are right or wrong):
\"\"\"
${RBI_FACTSHEET_TEXT}
\"\"\"

CANDIDATE DETAILED APPLICATION FORM (DAF) (Use ONLY as background context — NEVER pretend the candidate spoke DAF text unless they actually said it in their answers):
- Name: ${profile.name}
- Academic Degree: ${profile.degree} in ${profile.stream} (${profile.graduationYear})
- Hometown: ${profile.hometown}, ${profile.state}
- Career Status: ${profile.careerStatus} (Details: ${profile.gapOrWorkDetails})
- Target Exam: ${profile.targetExam}
- Stated Hobbies: ${profile.hobbies}
- Language Preference: ${profile.languagePref}
- Mode: ${profile.sessionMode}

CANDIDATE PARTICIPATION SUMMARY:
- Total Panelist Questions Asked: ${totalExchanges}
- Questions Answered by Candidate: ${answeredExchanges}
- Total Candidate Words Spoken/Typed: ${totalCandidateWords}

STRUCTURED INTERVIEW EXCHANGES (Evaluate ONLY against the Candidate Verbatim Answer shown below):
\"\"\"
${structuredExchangesText}
\"\"\"

${
  webcamSnapshots && webcamSnapshots.length > 0
    ? `NOTE: ${webcamSnapshots.length} webcam frame snapshot(s) of the candidate captured during the live viva are attached. Analyze posture, professional presence, eye gaze, camera framing, and grooming ONLY from what is visibly observable in those snapshots.`
    : `NOTE: No webcam video snapshots were provided. Do NOT fabricate visual observations; evaluate communication strictly based on what the candidate actually said.`
}

STRICT ANTI-HALLUCINATION & GROUNDED GRADING RULES (MANDATORY):
1. ZERO HALLUCINATION: Never attribute facts, figures (such as Repo rate, CRR, PSL targets, DBT, Lead Bank, or degree rationales), or polished answers from REFERENCE RBI & BANKING BENCHMARKS, the CANDIDATE DAF, or the panelist's question to the candidate unless the candidate explicitly spoke them in "Candidate Verbatim Answer".
2. UNANSWERED / WEAK ANSWERS: Any exchange marked "[NO ANSWER PROVIDED BY CANDIDATE]" MUST have "candidateAnswer": "(No response provided by candidate)" and "scoreOutOf10": 0. Brief, vague, off-topic, filler-only, or non-substantive answers MUST score 1 to 3 out of 10.
3. UNASKED / UNANSWERED CATEGORIES: If no questions were answered in a category's domain (e.g., Seat 2/3 for bankingAwareness, Seat 1 for personalProfileConviction, Seat 4 for situationalOfficerQualities), that category MUST score 0 (or be strictly proportional only to the questions actually answered in that category).
4. ONE-TO-ONE QUESTION CORRESPONDENCE: Populate "questionByQuestion" with one entry per Exchange listed in STRUCTURED INTERVIEW EXCHANGES, preserving the exact order and quoting/summarizing only what the candidate actually said.

SCORING CRITERIA (Total: 100 Marks):
1. Banking Awareness & RBI Guidelines (Max 30 Marks):
   - Strict factual grading against official rates, PSL categories (40%, 18% agri, 10% SMF, 7.5% micro, 12% weaker), NPA norms (90-day overdue, SMA stages, provisioning), DICGC (₹5L), and flagships (PMJDY, Mudra, APY) — ONLY credit what the candidate actually stated.
2. Profile & Degree Cross-Questioning Conviction (Max 25 Marks):
   - Ability to defend career choices, gap year justification, degree application to public sector banking, and knowledge of home district/state economy — ONLY credit what the candidate actually stated.
3. Situational Officer Qualities & Branch Leadership (Max 20 Marks):
   - Tact in dealing with irate rural farmers, refusing unlawful VIP pressures, staff coordination, handling branch cash/audit discrepancies, and customer service patience — ONLY credit what the candidate actually stated.
4. Honesty & Anti-Bluffing Integrity (Max 15 Marks):
   - Candidates who politely admit "I do not know right now" score well here, whereas bluffing or guessing wrong financial data is penalized. If the candidate barely spoke or gave mostly unanswered/off-topic responses, score proportionally low. List ANY invented facts or erroneous statistics under bluffsDetected.
5. Communication & Body Language (Max 10 Marks):
   - Clear articulation, active listening, polite prefixes ("Sir/Ma'am"), composure under cross-examination, and visual camera posture observations (if snapshots attached).

VERDICT RULES:
- 80-100: "Selected (High Merit)"
- 65-79: "Selected (Borderline)"
- 50-64: "Waitlisted"
- Below 50: "Needs Improvement"

OUTPUT SPECIFICATION:
Respond with STRICT, VALID JSON ONLY with NO surrounding markdown backticks.
The JSON must adhere to this exact schema:
{
  "overallScore": number (sum of the 5 category scores, integer 0-100),
  "verdict": "Selected (High Merit)" | "Selected (Borderline)" | "Waitlisted" | "Needs Improvement",
  "categoryScores": {
    "bankingAwareness": { "score": number (0-30), "max": 30, "note": string },
    "personalProfileConviction": { "score": number (0-25), "max": 25, "note": string },
    "situationalOfficerQualities": { "score": number (0-20), "max": 20, "note": string },
    "honestyAntiBluff": {
      "score": number (0-15),
      "max": 15,
      "note": string,
      "bluffsDetected": string[] (list of any factually incorrect claims or guessed figures made by candidate)
    },
    "communicationAndBodyLanguage": {
      "score": number (0-10),
      "max": 10,
      "note": string,
      "webcamObservations": string[] (3-4 grounded observations from snapshots/transcript; empty or honest note if absent)
    }
  },
  "questionByQuestion": [
    {
      "question": string (the question asked by the panelist),
      "askedBy": string (panelist name or title),
      "candidateAnswer": string (faithful summary of ONLY what the candidate said, or "(No response provided by candidate)"),
      "scoreOutOf10": number (0-10),
      "critique": string (honest, constructive feedback highlighting gaps, inaccuracies, or missing points),
      "idealModelAnswer": string (the gold-standard answer an elite PO candidate should have given)
    }
  ],
  "topStrengths": string[] (honest standout qualities actually demonstrated; if minimal participation, say so honestly),
  "actionItems": string[] (3-4 high-impact actionable improvements before the real exam)
}
`.trim();

    // Prepare multimodal content parts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentParts: any[] = [];

    // Add up to 3 webcam snapshot images if provided
    if (webcamSnapshots && Array.isArray(webcamSnapshots)) {
      for (const snapshot of webcamSnapshots.slice(0, 3)) {
        if (typeof snapshot === 'string') {
          const match = snapshot.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
          if (match) {
            contentParts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }

    // Add prompt text part
    contentParts.push({
      text: evaluationPrompt,
    });

    const response = await client.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contentParts,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const rawText = response.text || '{}';
    let report: EvaluationReport;

    try {
      report = JSON.parse(cleanJsonString(rawText));
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        report = JSON.parse(match[0]);
      } else {
        throw new Error('Unable to parse evaluation report JSON from Gemini response');
      }
    }

    // Post-process questionByQuestion strictly against structured exchanges
    const rawQuestions = Array.isArray(report.questionByQuestion) ? report.questionByQuestion : [];
    const alignedMatch = rawQuestions.length === exchanges.length;
    report.questionByQuestion = rawQuestions.map((q, idx) => {
      let score = Math.min(10, Math.max(0, Number(q.scoreOutOf10) || 0));
      let candidateAnswer = (q.candidateAnswer || '').trim();

      if (alignedMatch && !exchanges[idx]?.candidateVerbatimAnswer) {
        score = 0;
        candidateAnswer = '(No response provided by candidate)';
      } else if (
        !candidateAnswer ||
        /^(no response|candidate was silent|\(candidate was silent)/i.test(candidateAnswer)
      ) {
        score = 0;
        candidateAnswer = '(No response provided by candidate)';
      }

      return {
        ...q,
        candidateAnswer,
        scoreOutOf10: Math.round(score * 10) / 10,
      };
    });

    // Clamp individual category scores to [0, max]
    const categoryCaps: Array<
      [keyof EvaluationReport['categoryScores'], number]
    > = [
      ['bankingAwareness', 30],
      ['personalProfileConviction', 25],
      ['situationalOfficerQualities', 20],
      ['honestyAntiBluff', 15],
      ['communicationAndBodyLanguage', 10],
    ];

    for (const [key, maxVal] of categoryCaps) {
      const cat = report.categoryScores?.[key];
      if (cat) {
        cat.score = Math.round(Math.min(maxVal, Math.max(0, Number(cat.score) || 0)));
      }
    }

    // Compute strict mathematical ceiling from actual question-by-question performance
    const expectedQuestions = Math.max(totalExchanges, 4);
    const sumQuestionScores = report.questionByQuestion.reduce(
      (acc, q) => acc + (Number(q.scoreOutOf10) || 0),
      0
    );
    const maxPossibleQuestionScore = expectedQuestions * 10;
    const questionPerformanceRatio = Math.min(
      1,
      Math.max(0, sumQuestionScores / maxPossibleQuestionScore)
    );
    let maxAllowedOverall = Math.min(100, Math.round(questionPerformanceRatio * 100) + 5);
    if (totalCandidateWords < 15) {
      maxAllowedOverall = Math.min(maxAllowedOverall, 15);
    }

    const rawCategorySum = categoryCaps.reduce(
      (acc, [key]) => acc + (report.categoryScores?.[key]?.score || 0),
      0
    );

    if (rawCategorySum > maxAllowedOverall && rawCategorySum > 0) {
      const scale = maxAllowedOverall / rawCategorySum;
      for (const [key] of categoryCaps) {
        const cat = report.categoryScores?.[key];
        if (cat) {
          cat.score = Math.floor(cat.score * scale);
        }
      }
    }

    // Recompute overallScore as exact sum of clamped category scores and derive verdict deterministically
    const finalOverall = categoryCaps.reduce(
      (acc, [key]) => acc + (report.categoryScores?.[key]?.score || 0),
      0
    );
    report.overallScore = Math.min(100, Math.max(0, finalOverall));
    report.verdict = computeVerdict(report.overallScore);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error: unknown) {
    console.error('Error generating evaluation report:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate interview evaluation report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
