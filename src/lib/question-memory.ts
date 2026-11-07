/**
 * Question Exclusion Memory & 4-Seat IBPS Sub-Topic Rotation Engine
 *
 * Persists asked questions and completed round counts in browser storage.
 * Deterministically rotates panelist interrogation angles across 4 seats
 * so candidate practice sessions simulate authentic multi-round IBPS / SBI PO interviews.
 */

export const STORAGE_KEY_PAST_QUESTIONS = 'merit_past_questions';
export const STORAGE_KEY_ROUND_COUNT = 'merit_round_count';

export interface QuestionHistory {
  roundCount: number;
  pastQuestions: string[];
}

export interface SeatAngles {
  seat1: string;
  seat2: string;
  seat3: string;
  seat4: string;
}

export const SEAT_1_ROTATION_POOL: string[] = [
  'Core Profile & Motivation: Self-introduction, why banking after your specific graduation stream, and long-term career vision in a PSU bank.',
  'District Economy & Roots: Hometown economic activities, GI tags / One District One Product (ODOP), family background, and adaptability to all-India postings.',
  'PSU vs. Private/FinTech & Leadership: Why join a Public Sector Bank over private banks or IT/corporate roles, personal strengths/weaknesses, and a past leadership or pressure example.',
  'Hobbies, Ethics & Work-Life: Deep dive into stated hobbies/extracurriculars, how you handle exam/work stress, and what makes a good Scale-I Probationary Officer on Day 1.',
];

export const SEAT_2_ROTATION_POOL: string[] = [
  'Monetary Policy & Inflation: Repo Rate, SDF, MSF, Bank Rate, CRR, SLR, MPC stance, and how RBI balances inflation vs. GDP growth.',
  'Asset Quality & Bad Loan Recovery: SMA-0/1/2 classification, 90-day NPA norm, Sub-standard/Doubtful/Loss assets, Provisioning, SARFAESI Act (₹1L limit), IBC, and NARCL.',
  'Digital Banking & Cyber Fraud Controls: UPI, UPI Lite, UPI 123Pay, CBDC (e-Rupee), Mule accounts (MuleHunter.AI), Digital Lending Guidelines, and protecting customers from phishing/digital arrest scams.',
  'Financial Inclusion & Priority Sector Lending: PSL 40% target (18% Agri, 10% SMF, 7.5% Micro, 12% Weaker Sections), PMJDY, Mudra (Shishu, Kishore, Tarun, Tarun Plus up to ₹20L), Kisan Credit Card (KCC), and SHGs.',
  'Day-to-Day Branch Operations: CASA ratio, KYC/AML norms, Negotiable Instruments Act (Crossed vs. Bearer vs. Stale cheques), Nomination vs. Joint Account survivorship, DICGC ₹5L insurance, and Retail vs. Corporate lending.',
];

export const SEAT_3_ROTATION_POOL: string[] = [
  'Degree-to-Banking Application: Practical ways your specific graduation subject applies to credit appraisal, MSME assessment, risk analysis, or branch technology.',
  'Union Budget, Fiscal Policy & Macro: Fiscal deficit targets, Capital Expenditure (Capex), CPI vs. WPI inflation, GDP growth drivers, and direct/indirect tax trends.',
  'External Sector, Currency & Trade: Rupee exchange rate dynamics, Forex reserves, Current Account Deficit (CAD), export credit, and global macroeconomic headwinds.',
  'Emerging Banking Trends: Green banking & ESG lending, AI & data analytics in public sector banks, Account Aggregator framework, and co-lending models between banks and NBFCs.',
];

export const SEAT_4_ROTATION_POOL: string[] = [
  'Rural Branch & Farmer Empathy (Hindi/Hinglish): Handling an agitated farmer at a rural branch facing a KCC or crop-insurance delay, explaining banking procedures in simple local language.',
  'Ethical Dilemma & VIP Pressure: A local politician or influential businessman pressures you to sanction an unviable Mudra/MSME loan with incomplete documents—how do you refuse tactfully without escalating conflict?',
  'Cyber Fraud / ATM Crisis at the Counter: An elderly pensioner is panicking at your branch because ₹40,000 was debited via a fraudulent link or failed ATM transaction—how do you calm them and act immediately?',
  'Branch Team Leadership as a Young Officer: As a newly posted 23-year-old Scale-I Officer, how will you earn respect and coordinate work with senior clerical staff who are 50+ years old and hesitant about new digital tools?',
];

/**
 * Returns the candidate's current round count and cumulative past questions.
 */
export function getQuestionHistory(): QuestionHistory {
  if (typeof window === 'undefined') {
    return { roundCount: 1, pastQuestions: [] };
  }

  try {
    const rawCount = localStorage.getItem(STORAGE_KEY_ROUND_COUNT);
    const parsedCount = rawCount ? parseInt(rawCount, 10) : 1;
    const roundCount = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;

    const rawQuestions = localStorage.getItem(STORAGE_KEY_PAST_QUESTIONS);
    let pastQuestions: string[] = [];
    if (rawQuestions) {
      const parsed = JSON.parse(rawQuestions);
      if (Array.isArray(parsed)) {
        pastQuestions = parsed
          .map((q) => (typeof q === 'string' ? q.trim() : ''))
          .filter((q) => q.length > 5);
      }
    }

    return { roundCount, pastQuestions };
  } catch (err) {
    console.warn('Error reading question history from localStorage:', err);
    return { roundCount: 1, pastQuestions: [] };
  }
}

/**
 * Appends unique questions from a completed round (keeping up to last 50)
 * and increments the merit round count for the candidate.
 */
export function recordCompletedRoundQuestions(questions: string[]): void {
  if (typeof window === 'undefined') return;

  try {
    const history = getQuestionHistory();
    const existing = new Set(history.pastQuestions.map((q) => q.toLowerCase()));

    const newlyAdded: string[] = [];
    for (const q of questions) {
      const trimmed = q.trim();
      if (trimmed.length > 8 && !existing.has(trimmed.toLowerCase())) {
        existing.add(trimmed.toLowerCase());
        newlyAdded.push(trimmed);
      }
    }

    const merged = [...history.pastQuestions, ...newlyAdded].slice(-50);
    const nextRoundCount = history.roundCount + 1;

    localStorage.setItem(STORAGE_KEY_PAST_QUESTIONS, JSON.stringify(merged));
    localStorage.setItem(STORAGE_KEY_ROUND_COUNT, String(nextRoundCount));
  } catch (err) {
    console.warn('Error recording completed round questions:', err);
  }
}

/**
 * Clears question history and resets the round count back to Round 1.
 */
export function resetQuestionHistory(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY_PAST_QUESTIONS);
    localStorage.setItem(STORAGE_KEY_ROUND_COUNT, '1');
  } catch (err) {
    console.warn('Error resetting question history:', err);
  }
}

/**
 * Selects rotated sub-topic angles for each of the 4 panelist seats based on round number.
 */
export function pickSessionAngles(roundIndex: number = 1): SeatAngles {
  const safeIndex = Math.max(1, Math.floor(roundIndex)) - 1;

  const seat1 = SEAT_1_ROTATION_POOL[safeIndex % SEAT_1_ROTATION_POOL.length];
  const seat2 = SEAT_2_ROTATION_POOL[safeIndex % SEAT_2_ROTATION_POOL.length];
  const seat3 = SEAT_3_ROTATION_POOL[safeIndex % SEAT_3_ROTATION_POOL.length];
  const seat4 = SEAT_4_ROTATION_POOL[safeIndex % SEAT_4_ROTATION_POOL.length];

  return { seat1, seat2, seat3, seat4 };
}
