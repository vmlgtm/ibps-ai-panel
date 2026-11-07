import { NextResponse } from 'next/server';
import { extractApiKeyFromRequest, getGeminiClient } from '@/lib/gemini-server';
import { CandidateProfile, PreInterviewDossier } from '@/lib/types';
import { RBI_FACTSHEET_SUMMARY } from '@/lib/rbi-factsheet';
import { pickSessionAngles } from '@/lib/question-memory';

interface DossierRequestBody {
  action?: 'generate_dossier' | 'parse_resume';
  profile?: CandidateProfile;
  resumeText?: string;
  pastQuestions?: string[];
  roundNumber?: number;
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
    const body: DossierRequestBody = await request.json();

    // 1. Resume Parsing Action (auto-fill DAF from pasted or uploaded resume)
    if (body.action === 'parse_resume' || (body.resumeText && !body.profile)) {
      if (!body.resumeText?.trim()) {
        return NextResponse.json({ error: 'resumeText is required for parsing' }, { status: 400 });
      }

      const prompt = `
You are an expert HR Analyst for the Institute of Banking Personnel Selection (IBPS / SBI PO).
Analyze the candidate's resume/CV text provided below and extract biographical & educational fields
to auto-fill the Detailed Application Form (DAF).

Output ONLY valid, parseable JSON with NO markdown formatting, matching this schema:
{
  "name": string (full name or ""),
  "degree": string (e.g. "B.Tech", "B.Com", "B.Sc", "B.A", "MBA"),
  "stream": string (e.g. "Computer Science", "Finance", "Mechanical Engineering", "Agriculture"),
  "graduationYear": string (e.g. "2024"),
  "hometown": string (city or district if found, else ""),
  "state": string (Indian state if found, else ""),
  "careerStatus": "fresher" | "gap" | "working",
  "gapOrWorkDetails": string (brief description of work experience or reason for study gap),
  "hobbies": string (hobbies/interests listed or inferred),
  "targetExam": "IBPS PO" | "SBI PO",
  "resumeHighlights": string (3-4 crisp bullet points highlighting academic achievements, leadership, fintech/banking projects, or work impact)
}

Resume text:
"""
${body.resumeText.slice(0, 10000)}
"""
`.trim();

      const response = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const text = response.text || '{}';
      const parsed = JSON.parse(cleanJsonString(text));

      return NextResponse.json({
        success: true,
        extractedProfile: parsed,
        resumeHighlights: parsed.resumeHighlights || '',
      });
    }

    // 2. Pre-Interview Dossier Generation
    const profile = body.profile;
    if (!profile) {
      return NextResponse.json({ error: 'Candidate profile is required' }, { status: 400 });
    }

    const roundNumber =
      typeof body.roundNumber === 'number' && body.roundNumber > 0 ? body.roundNumber : 1;
    const pastQuestions = Array.isArray(body.pastQuestions)
      ? body.pastQuestions.filter((q) => typeof q === 'string' && q.trim().length > 0)
      : [];
    const seatAngles = pickSessionAngles(roundNumber);
    const temperature = roundNumber > 1 ? 0.65 : 0.3;

    const pastQuestionsBlock =
      pastQuestions.length > 0
        ? `\nPREVIOUSLY ASKED QUESTIONS IN PAST SESSIONS (STRICTLY DO NOT REPEAT THESE; GENERATE COMPLETELY FRESH ANGLES):\n${pastQuestions
            .slice(-15)
            .map((q, idx) => `${idx + 1}. ${q}`)
            .join('\n')}\n`
        : '';

    const dossierPrompt = `
You are the Chief Interview Coordinator for the IBPS / SBI PO Interview Board.
Prepare a sharp, grounded Pre-Interview Briefing Dossier for the 4-member expert panel
interviewing the following candidate:

Candidate Name: ${profile.name}
Degree & Stream: ${profile.degree} in ${profile.stream} (${profile.graduationYear})
Hometown & State: ${profile.hometown}, ${profile.state}
Career Status: ${profile.careerStatus} (${profile.gapOrWorkDetails})
Hobbies & Interests: ${profile.hobbies}
Target Examination: ${profile.targetExam}
Resume Highlights: ${profile.resumeHighlights || 'None specified'}
Round Number: ${roundNumber}
${pastQuestionsBlock}
Generate the dossier in STRICT JSON format with NO markdown wrapping, matching this exact structure:
{
  "hometownFacts": [
    "3 specific, authentic economic, agricultural, industrial, GI-tag, or cultural facts about ${profile.hometown}, ${profile.state} that an IBPS panelist would ask about (e.g. major local crops, leading industries, regional rural banks headquarter, handicrafts, or economic challenges)"
  ],
  "degreeCrossQuestions": [
    "3 sharp IBPS panel questions linking the candidate's degree (${profile.degree} in ${profile.stream}) and background to commercial banking, credit risk appraisal, digital banking / cyber fraud, or rural branch management"
  ],
  "currentBankingTopics": [
    "3 hot current Indian banking / RBI / regulatory topics relevant right now (e.g., ECL credit loss provisioning, CBDC digital rupee adoption, liquidity management, priority sector lending sub-targets, microfinance regulations, or UPI fraud controls)"
  ]
}

Ensure all facts are authentic, accurate, and directly usable by veteran Indian bankers during the viva voce.
`.trim();

    let rawText: string | null = null;

    // Try first with Google Search grounding for real-time verification of hometown facts & RBI updates
    try {
      const groundedResponse = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: dossierPrompt,
        config: {
          tools: [{ googleSearch: {} }],
          temperature,
        },
      });
      rawText = groundedResponse.text || null;
    } catch (groundingError) {
      console.warn(
        'Google Search grounding unavailable or restricted on this API key; generating via standard gemini-3.8-flash:',
        groundingError instanceof Error ? groundingError.message : groundingError
      );
    }

    // Fallback if search-grounded call was rejected or returned empty
    if (!rawText) {
      const fallbackResponse = await client.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: dossierPrompt,
        config: {
          responseMimeType: 'application/json',
          temperature,
        },
      });
      rawText = fallbackResponse.text || '{}';
    }

    let parsedDossierData: {
      hometownFacts?: string[];
      degreeCrossQuestions?: string[];
      currentBankingTopics?: string[];
    };

    try {
      parsedDossierData = JSON.parse(cleanJsonString(rawText));
    } catch {
      // In case formatting had extra prose
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedDossierData = JSON.parse(match[0]);
      } else {
        throw new Error('Could not parse dossier JSON from Gemini response');
      }
    }

    const dossier: PreInterviewDossier = {
      hometownFacts: Array.isArray(parsedDossierData.hometownFacts)
        ? parsedDossierData.hometownFacts
        : [
            `${profile.hometown} is a prominent commercial and agrarian center in ${profile.state}.`,
            `Local branches handle significant Priority Sector Lending (PSL) credit for agriculture and micro-enterprises.`,
            `Key regional banking institutions include lead banks coordinating the State Level Bankers' Committee (SLBC).`,
          ],
      degreeCrossQuestions: Array.isArray(parsedDossierData.degreeCrossQuestions)
        ? parsedDossierData.degreeCrossQuestions
        : [
            `How can your background in ${profile.stream} be leveraged to improve retail lending or digital transaction security in a public sector branch?`,
            `As a ${profile.degree} graduate, how would you evaluate creditworthiness and cash flow for an SME customer without relying solely on audited balance sheets?`,
            `Given your preparation gap (${profile.gapOrWorkDetails}), how will you handle the high pressure and customer footfall of a rural or semi-urban branch?`,
          ],
      currentBankingTopics: Array.isArray(parsedDossierData.currentBankingTopics)
        ? parsedDossierData.currentBankingTopics
        : [
            'RBI Expected Credit Loss (ECL) provisioning framework vs incurred loss approach.',
            'Digital Lending Guidelines & Default Loss Guarantee (DLG) in fintech partnerships.',
            'Priority Sector Lending (PSL) targets: 40% ANBC, including 18% agriculture and 7.5% micro-enterprises.',
          ],
      rbiQuickRef: RBI_FACTSHEET_SUMMARY,
      roundNumber,
      avoidedQuestions: pastQuestions.slice(-15),
      seatAngles,
    };

    return NextResponse.json({
      success: true,
      dossier,
    });
  } catch (error: unknown) {
    console.error('Error generating dossier:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate candidate dossier';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
