import { NextResponse } from 'next/server';
import { extractApiKeyFromRequest, getGeminiClient } from '@/lib/gemini-server';
import { CandidateProfile, EvaluationReport, TranscriptEntry } from '@/lib/types';
import { RBI_FACTSHEET_TEXT } from '@/lib/rbi-factsheet';

interface EvaluateRequestBody {
  profile: CandidateProfile;
  transcript: TranscriptEntry[];
  webcamSnapshots?: string[]; // Array of base64 data URLs (e.g. data:image/jpeg;base64,...)
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

    // Format transcript entries chronologically
    const transcriptFormatted = transcript
      .map((entry) => `[${entry.speakerName}]: ${entry.text}`)
      .join('\n\n');

    const evaluationPrompt = `
You are the Grand Assessment Committee of the Institute of Banking Personnel Selection (IBPS) and State Bank of India (SBI PO).
You are conducting a strict, rigorous, and constructive viva voce evaluation for a Probationary Officer candidate.

REFERENCE RBI & BANKING BENCHMARKS (Evaluate candidate's factual accuracy against this ground truth):
\"\"\"
${RBI_FACTSHEET_TEXT}
\"\"\"

CANDIDATE DETAILED APPLICATION FORM (DAF):
- Name: ${profile.name}
- Academic Degree: ${profile.degree} in ${profile.stream} (${profile.graduationYear})
- Hometown: ${profile.hometown}, ${profile.state}
- Career Status: ${profile.careerStatus} (Details: ${profile.gapOrWorkDetails})
- Target Exam: ${profile.targetExam}
- Stated Hobbies: ${profile.hobbies}
- Language Preference: ${profile.languagePref}
- Mode: ${profile.sessionMode}

FULL INTERVIEW TRANSCRIPT:
\"\"\"
${transcriptFormatted}
\"\"\"

${
  webcamSnapshots && webcamSnapshots.length > 0
    ? `NOTE: ${webcamSnapshots.length} webcam frame snapshot(s) of the candidate captured during the live viva are attached. Analyze posture, professional presence, eye gaze, camera framing, and grooming.`
    : `NOTE: No webcam video snapshots were provided. Assess communication, composure, and professionalism strictly based on verbal transcript flow.`
}

SCORING CRITERIA (Total: 100 Marks):
1. Banking Awareness & RBI Guidelines (Max 30 Marks):
   - Strict factual grading against official rates, PSL categories (40%, 18% agri, 10% SMF, 7.5% micro, 12% weaker), NPA norms (90-day overdue, SMA stages, provisioning), DICGC (₹5L), and flagships (PMJDY, Mudra, APY).
2. Profile & Degree Cross-Questioning Conviction (Max 25 Marks):
   - Ability to defend career choices, gap year justification, degree application to public sector banking, and knowledge of home district/state economy.
3. Situational Officer Qualities & Branch Leadership (Max 20 Marks):
   - Tact in dealing with irate rural farmers, refusing unlawful VIP pressures, staff coordination, handling branch cash/audit discrepancies, and customer service patience.
4. Honesty & Anti-Bluffing Integrity (Max 15 Marks):
   - VERY IMPORTANT: In IBPS interviews, bluffing or guessing wrong financial data is heavily penalized. Candidates who politely and candidly state "I am sorry Sir/Ma'am, I am unable to recall the exact number right now" should receive high honesty marks. List ANY invented facts or erroneous statistics under bluffsDetected.
5. Communication & Body Language (Max 10 Marks):
   - Clear articulation, active listening, polite prefixes ("Sir/Ma'am"), composure under cross-examination, and visual camera posture/attire observations.

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
      "webcamObservations": string[] (3-4 specific visual and verbal observations regarding posture, eye contact, grooming, or verbal clarity)
    }
  },
  "questionByQuestion": [
    {
      "question": string (the question asked by the panelist),
      "askedBy": string (panelist name or title, e.g. "Chairman Shri R.K. Sharma"),
      "candidateAnswer": string (summary of what the candidate answered),
      "scoreOutOf10": number (0-10),
      "critique": string (constructive feedback highlighting inaccuracies or strengths),
      "idealModelAnswer": string (the gold-standard answer an elite PO candidate should have given)
    }
  ],
  "topStrengths": string[] (3-4 notable standout qualities displayed),
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
        temperature: 0.2,
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

    // Ensure overallScore matches category sum if inconsistent
    const calcOverall =
      (report.categoryScores?.bankingAwareness?.score || 0) +
      (report.categoryScores?.personalProfileConviction?.score || 0) +
      (report.categoryScores?.situationalOfficerQualities?.score || 0) +
      (report.categoryScores?.honestyAntiBluff?.score || 0) +
      (report.categoryScores?.communicationAndBodyLanguage?.score || 0);

    if (typeof report.overallScore !== 'number' || Math.abs(report.overallScore - calcOverall) > 5) {
      report.overallScore = Math.min(100, Math.max(0, calcOverall));
    }

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
