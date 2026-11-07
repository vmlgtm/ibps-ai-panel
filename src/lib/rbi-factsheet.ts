import { CandidateProfile } from './types';

export interface RbiRateStructure {
  repoRate: string;
  standingDepositFacilityRate: string; // SDF
  marginalStandingFacilityRate: string; // MSF
  bankRate: string;
  cashReserveRatio: string; // CRR
  statutoryLiquidityRatio: string; // SLR
  reverseRepoRate: string;
}

export interface PslTarget {
  category: string;
  targetPercent: string;
  notes: string;
}

export interface NpaClassification {
  category: string;
  timeframe: string;
  provisioningPercent: string;
}

export interface GovernmentScheme {
  name: string;
  acronym: string;
  keyDetails: string;
  eligibilityOrCap: string;
}

export interface BankingFactSheet {
  updatedYear: string;
  monetaryPolicyRates: RbiRateStructure;
  prioritySectorLending: PslTarget[];
  npaNorms: {
    definition: string;
    smaCategories: Array<{ stage: string; overduePeriod: string; description: string }>;
    assetClassifications: NpaClassification[];
    recoveryMechanisms: string[];
  };
  depositInsurance: {
    corporation: string;
    coverageLimit: string;
    eligibleDeposits: string;
  };
  flagshipSchemes: GovernmentScheme[];
  digitalBankingAndPayments: Array<{
    system: string;
    fullForm: string;
    operatingAuthority: string;
    keyCharacteristics: string;
  }>;
}

export const RBI_BANKING_FACTSHEET: BankingFactSheet = {
  updatedYear: '2026',
  monetaryPolicyRates: {
    repoRate: '6.50%',
    standingDepositFacilityRate: '6.25%',
    marginalStandingFacilityRate: '6.75%',
    bankRate: '6.75%',
    cashReserveRatio: '4.50%',
    statutoryLiquidityRatio: '18.00%',
    reverseRepoRate: '3.35%',
  },
  prioritySectorLending: [
    {
      category: 'Total Priority Sector Lending (PSL)',
      targetPercent: '40% of ANBC (Adjusted Net Bank Credit)',
      notes: 'Mandatory for domestic commercial banks and foreign banks with 20+ branches.',
    },
    {
      category: 'Agriculture',
      targetPercent: '18% of ANBC',
      notes: 'Includes farm credit, agricultural infrastructure, and ancillary activities.',
    },
    {
      category: 'Small and Marginal Farmers (SMF)',
      targetPercent: '10% of ANBC',
      notes: 'Sub-target within the 18% agriculture allocation.',
    },
    {
      category: 'Micro Enterprises',
      targetPercent: '7.5% of ANBC',
      notes: 'Under MSMED Act classification.',
    },
    {
      category: 'Weaker Sections',
      targetPercent: '12% of ANBC',
      notes: 'Includes SC/ST, women beneficiaries, PMJDY overdraft accounts, and disabled persons.',
    },
  ],
  npaNorms: {
    definition: 'An asset becomes Non-Performing when interest or principal remains overdue for more than 90 days in respect of a term loan.',
    smaCategories: [
      { stage: 'SMA-0', overduePeriod: '1 – 30 days', description: 'Early sign of stress in principal or interest payment' },
      { stage: 'SMA-1', overduePeriod: '31 – 60 days', description: 'Medium stress alert, bank initiates intensive follow-up' },
      { stage: 'SMA-2', overduePeriod: '61 – 90 days', description: 'Critical stress alert, reported to CRILC before becoming NPA' },
    ],
    assetClassifications: [
      { category: 'Sub-Standard Asset', timeframe: 'Remained an NPA for <= 12 months', provisioningPercent: '15% for secured, 25% for unsecured' },
      { category: 'Doubtful Asset (D1)', timeframe: 'Sub-standard for up to 1 year', provisioningPercent: '25% secured + 100% unsecured' },
      { category: 'Doubtful Asset (D2)', timeframe: 'Doubtful for 1 to 3 years', provisioningPercent: '40% secured + 100% unsecured' },
      { category: 'Doubtful Asset (D3)', timeframe: 'Doubtful for > 3 years', provisioningPercent: '100% secured + 100% unsecured' },
      { category: 'Loss Asset', timeframe: 'Identified as uncollectible by bank or RBI inspectors', provisioningPercent: '100% provisioning required' },
    ],
    recoveryMechanisms: [
      'SARFAESI Act 2002: Allows banks to seize and auction collateral without court intervention for defaults > ₹1 Lakh (unsecured debts excluded).',
      'Insolvency and Bankruptcy Code (IBC 2016): National Company Law Tribunal (NCLT) resolution process with a 180+90 day statutory window.',
      'Debt Recovery Tribunals (DRT): For claims of ₹20 Lakhs and above.',
      'Lok Adalats: For compromise settlements up to ₹20 Lakhs.',
      'NARCL (National Asset Reconstruction Company Ltd / Bad Bank): Acquires stressed assets with sovereign guarantee backing.',
    ],
  },
  depositInsurance: {
    corporation: 'Deposit Insurance and Credit Guarantee Corporation (DICGC - 100% RBI subsidiary)',
    coverageLimit: '₹5,00,000 per depositor per bank (covers both principal and interest combined across all branches)',
    eligibleDeposits: 'Savings, Fixed (FD), Current, and Recurring (RD) deposits in all commercial and cooperative banks.',
  },
  flagshipSchemes: [
    {
      name: 'Pradhan Mantri Jan Dhan Yojana',
      acronym: 'PMJDY',
      keyDetails: 'Zero-balance basic savings bank deposit (BSBD) account, RuPay debit card with ₹2 Lakh accidental insurance, and ₹10,000 overdraft facility after 6 months.',
      eligibilityOrCap: 'Universal access, one OD per eligible household (preferably lady of the house).',
    },
    {
      name: 'Pradhan Mantri Mudra Yojana',
      acronym: 'PMMY',
      keyDetails: 'Collateral-free loans for non-farm micro and small enterprises categorized into Shishu, Kishore, Tarun, and Tarun Plus.',
      eligibilityOrCap: 'Shishu: up to ₹50k; Kishore: ₹50k to ₹5L; Tarun: ₹5L to ₹10L; Tarun Plus (Budget 2024 update): up to ₹20L for entrepreneurs who previously availed and repaid Tarun loans.',
    },
    {
      name: 'PM Vishwakarma Scheme',
      acronym: 'PM-Vishwakarma',
      keyDetails: 'Holistic support for traditional artisans and craftspeople (18 trades) including toolkit incentive of ₹15,000, concessional collateral-free credit at 5% interest subsidy.',
      eligibilityOrCap: 'Tranche 1: up to ₹1 Lakh (18-month tenure); Tranche 2: up to ₹2 Lakhs (30-month tenure).',
    },
    {
      name: 'Pradhan Mantri Suraksha Bima Yojana',
      acronym: 'PMSBY',
      keyDetails: 'Accidental death and full disability insurance cover of ₹2 Lakhs (partial disability ₹1 Lakh). Premium auto-debited annually.',
      eligibilityOrCap: 'Age 18–70 years with bank account. Premium: ₹20 per annum.',
    },
    {
      name: 'Pradhan Mantri Jeevan Jyoti Bima Yojana',
      acronym: 'PMJJBY',
      keyDetails: 'Life insurance cover of ₹2 Lakhs for death due to any reason. Premium auto-debited annually.',
      eligibilityOrCap: 'Age 18–50 years with bank account. Premium: ₹436 per annum.',
    },
    {
      name: 'Atal Pension Yojana',
      acronym: 'APY',
      keyDetails: 'Guaranteed monthly pension (₹1,000, ₹2,000, ₹3,000, ₹4,000, or ₹5,000) starting at age 60 managed by PFRDA.',
      eligibilityOrCap: 'Age 18–40 years (non-income tax payers). Contribution varies by joining age.',
    },
  ],
  digitalBankingAndPayments: [
    {
      system: 'UPI (Unified Payments Interface)',
      fullForm: 'Unified Payments Interface',
      operatingAuthority: 'NPCI (National Payments Corporation of India)',
      keyCharacteristics: 'Instant mobile real-time payment protocol using Virtual Payment Address (VPA). Operates 24x7x365 with multi-factor authentication.',
    },
    {
      system: 'UPI Lite & UPI 123Pay',
      fullForm: 'UPI Lite / UPI 123Pay',
      operatingAuthority: 'NPCI / RBI',
      keyCharacteristics: 'UPI Lite offers on-device wallet for small-value offline transactions up to ₹500 (wallet limit ₹2,000) without PIN. UPI 123Pay enables IVR/missed-call payments on feature phones without internet.',
    },
    {
      system: 'CBDC (Central Bank Digital Currency / e-Rupee)',
      fullForm: 'Digital Rupee (e₹ - Retail and Wholesale)',
      operatingAuthority: 'Reserve Bank of India (RBI)',
      keyCharacteristics: 'Sovereign digital legal tender recorded on distributed ledger technology. Fungible with physical currency, does not earn interest, and supports offline transactions.',
    },
    {
      system: 'NEFT vs RTGS vs IMPS',
      fullForm: 'National Electronic Funds Transfer / Real Time Gross Settlement / Immediate Payment Service',
      operatingAuthority: 'RBI (NEFT, RTGS) & NPCI (IMPS)',
      keyCharacteristics: 'NEFT: Batch settlement in half-hourly batches 24x7, no min/max limit. RTGS: Continuous real-time gross settlement, minimum ₹2 Lakhs. IMPS: Real-time immediate transfer up to ₹5 Lakhs 24x7.',
    },
  ],
};

export const SAMPLE_PROFILES: CandidateProfile[] = [
  {
    name: 'Aarav Sharma',
    degree: 'B.Tech',
    stream: 'Computer Science and Engineering',
    graduationYear: '2024',
    hometown: 'Jaipur',
    state: 'Rajasthan',
    careerStatus: 'gap',
    gapOrWorkDetails: '1-year dedicated study gap preparing for competitive banking and civil services exams.',
    hobbies: 'Chess, competitive coding, following fintech and digital rupee trends',
    languagePref: 'hinglish',
    sessionMode: 'full',
    targetExam: 'IBPS PO',
    resumeHighlights: 'Led college robotics club; created a mini UPI payment simulator project; cleared IBPS PO Prelims & Mains in first attempt.',
  },
  {
    name: 'Pooja Kumari',
    degree: 'B.Com (Honours)',
    stream: 'Accounting and Financial Management',
    graduationYear: '2025',
    hometown: 'Patna',
    state: 'Bihar',
    careerStatus: 'fresher',
    gapOrWorkDetails: 'Final-year graduating student without any academic or career gap.',
    hobbies: 'Madhubani painting, tracking RBI monetary policy statements, debating',
    languagePref: 'hinglish',
    sessionMode: 'quick',
    targetExam: 'IBPS PO',
    resumeHighlights: 'Top 5% in university commerce cohort; internship at a local rural cooperative society studying KCC loan disbursements.',
  },
  {
    name: 'Rohan Deshpande',
    degree: 'B.E.',
    stream: 'Information Technology',
    graduationYear: '2023',
    hometown: 'Pune',
    state: 'Maharashtra',
    careerStatus: 'working',
    gapOrWorkDetails: '2 years of professional experience as Systems Engineer at Infosys Pune working on core enterprise middleware.',
    hobbies: 'Trekking in Sahyadri, playing badminton, personal finance blogs',
    languagePref: 'english',
    sessionMode: 'full',
    targetExam: 'SBI PO',
    resumeHighlights: 'Promoted early at Infosys; built automated reconciliation pipelines; seeks public sector career for direct grassroots societal impact and pan-India branch leadership.',
  },
];


export const RBI_FACTSHEET_SUMMARY = `
- Monetary Policy Rates (2026): Repo Rate: 6.50% | SDF: 6.25% | MSF & Bank Rate: 6.75% | CRR: 4.50% | SLR: 18.00% | Reverse Repo: 3.35%.
- Priority Sector Lending (PSL): 40% of ANBC for commercial banks. Agriculture: 18% (SMF sub-target 10%), Micro Enterprises: 7.5%, Weaker Sections: 12%.
- NPA Norms: 90 days overdue. SMA stages: SMA-0 (1-30 days), SMA-1 (31-60 days), SMA-2 (61-90 days). Asset classes: Sub-standard (<=12 mos, 15% prov), Doubtful D1 (25% prov), D2 (40% prov), D3 (100% prov), Loss Asset (100% prov).
- Key Recovery Laws: SARFAESI Act 2002 (collateral seizure without court for > ₹1L), IBC 2016 (NCLT corporate insolvency 180+90d), DRT (>= ₹20L), Lok Adalats (<= ₹20L), NARCL (Bad Bank with govt guarantee).
- DICGC Insurance: ₹5,00,000 per depositor per bank (principal + interest).
- Schemes: PMJDY (zero balance, RuPay, ₹10,000 OD), PMMY Mudra (Shishu up to ₹50k, Kishore ₹50k-5L, Tarun ₹5L-10L/20L), PM Vishwakarma (18 trades, ₹15k toolkit, ₹1L+₹2L @ 5%), PMJJBY (₹436/yr, ₹2L life), PMSBY (₹20/yr, ₹2L accidental), APY (₹1k-5k/mo pension, age 18-40).
- Payments: UPI & UPI Lite (wallet up to ₹2,000, max ₹500/tx without PIN), UPI 123Pay (feature phones), CBDC (e-Rupee sovereign digital currency), RTGS (min ₹2L real-time gross), NEFT (half-hourly batches 24x7), IMPS (immediate up to ₹5L).
`.trim();

export const RBI_FACTSHEET_TEXT = `
OFFICIAL RESERVE BANK OF INDIA & INDIAN BANKING FACT SHEET (CURRENT - 2026):

1. MONETARY POLICY & BENCHMARK POLICY RATES:
- Policy Repo Rate: 6.50% (Liquidity Adjustment Facility repo rate at which RBI lends short-term to commercial banks against government securities).
- Standing Deposit Facility (SDF) Rate: 6.25% (Collateral-free liquidity absorption tool at floor of LAF corridor).
- Marginal Standing Facility (MSF) Rate: 6.75% (Penal rate for overnight borrowing above repo quota against approved SLA securities).
- Bank Rate: 6.75% (Long-term rediscounting/lending rate aligned with MSF).
- Cash Reserve Ratio (CRR): 4.50% of Net Demand and Time Liabilities (NDTL) kept as liquid cash with RBI without interest.
- Statutory Liquidity Ratio (SLR): 18.00% of NDTL maintained in safe approved liquid assets like Central/State G-Secs, T-Bills, Gold.
- Fixed Reverse Repo Rate: 3.35%.

2. PRIORITY SECTOR LENDING (PSL) NORMS:
- Total PSL Target: 40% of Adjusted Net Bank Credit (ANBC) or Off-Balance Sheet Exposure (OBE), whichever is higher, for Domestic Scheduled Commercial Banks.
- Agriculture Sub-target: 18% of ANBC (includes farm credit, Agri-infra).
- Small and Marginal Farmers (SMF) Sub-target: 10% of ANBC.
- Micro Enterprises Sub-target: 7.5% of ANBC (under MSMED Act).
- Weaker Sections Sub-target: 12% of ANBC (includes SC/ST, women, beneficiaries of PMJDY/NRLM).
- Non-achievement Penalty: Deficit amounts must be contributed to RIDF (Rural Infrastructure Development Fund) managed by NABARD, or SIDBI/MUDRA/NHB funds at lower interest.

3. NON-PERFORMING ASSETS (NPA) & ASSET CLASSIFICATION:
- NPA Definition: Any term loan or advance where interest and/or installment of principal remains overdue for more than 90 days. For agricultural loans: 2 crop seasons for short duration crops, 1 crop season for long duration crops.
- Special Mention Accounts (SMA):
  * SMA-0: Principal or interest payment overdue for 1 to 30 days.
  * SMA-1: Overdue for 31 to 60 days (intensive monitoring alert).
  * SMA-2: Overdue for 61 to 90 days (mandatory CRILC reporting, pre-NPA warning).
- Classification:
  * Standard Asset: Normal servicing, 0.40% general provisioning for most loans (0.25% for residential housing).
  * Sub-Standard Asset: NPA for <= 12 months. Provision: 15% (secured), 25% (unsecured).
  * Doubtful Asset - D1 (up to 1 yr): 25% secured, 100% unsecured.
  * Doubtful Asset - D2 (1-3 yrs): 40% secured, 100% unsecured.
  * Doubtful Asset - D3 (> 3 yrs): 100% secured, 100% unsecured.
  * Loss Asset: Uncollectible / zero value identified by bank or RBI. Provision: 100%.
- Stressed Asset Recovery Avenues:
  * SARFAESI Act 2002: Direct enforcement of security interest/auction without court intervention (applies to secured loans > ₹1 Lakh where outstanding > 20% of principal).
  * Insolvency and Bankruptcy Code (IBC 2016): Corporate resolution before NCLT (statutory 180 + 90 days maximum).
  * Debt Recovery Tribunals (DRT): For claims >= ₹20 Lakhs.
  * Lok Adalats: Fast summary disposal for small claims up to ₹20 Lakhs.
  * National Asset Reconstruction Company Limited (NARCL / Bad Bank): Buys 15% cash + 85% government-backed Security Receipts.

4. DEPOSIT INSURANCE (DICGC):
- Deposit Insurance and Credit Guarantee Corporation (100% subsidiary of RBI).
- Covers up to ₹5,00,000 per depositor per insured bank (combining principal + accrued interest across all accounts and branches).
- Mandatory for all commercial banks, RRBs, cooperative banks.

5. KEY FINANCIAL INCLUSION & GOVERNMENT SCHEMES:
- Pradhan Mantri Jan Dhan Yojana (PMJDY): Zero minimum balance BSBD account, free RuPay debit card, ₹2 Lakh accidental insurance, ₹10,000 overdraft facility.
- Pradhan Mantri Mudra Yojana (PMMY): Non-corporate, non-farm micro/small enterprises collateral-free loans.
  * Shishu: Up to ₹50,000.
  * Kishore: ₹50,001 to ₹5,00,000.
  * Tarun: ₹5,00,001 to ₹10,00,000 (extended up to ₹20,00,000 for previous Tarun repayers).
- PM Vishwakarma Scheme: Financial and skill support for 18 traditional artisan trades (carpenters, blacksmiths, potters, etc.); ₹15,000 modern toolkit grant; collateral-free loan up to ₹1 Lakh (Tranche 1 @ 5% subsidized interest) + ₹2 Lakhs (Tranche 2).
- PMJJBY: Life insurance of ₹2 Lakhs for age 18-50 years at ₹436/year.
- PMSBY: Accidental insurance of ₹2 Lakhs for age 18-70 years at ₹20/year.
- Atal Pension Yojana (APY): Guaranteed monthly pension of ₹1,000 to ₹5,000 from age 60 for unorganized workers joining at age 18-40.

6. DIGITAL BANKING & PAYMENT INFRASTRUCTURE:
- Unified Payments Interface (UPI): NPCI 24x7 instant interbank mobile payment via VPA.
- UPI Lite: Low-value offline wallet on device (max wallet balance ₹2,000, per transaction limit ₹500) without PIN entry.
- UPI 123Pay: IVR / missed call payments for 400M+ feature-phone users without internet.
- Central Bank Digital Currency (CBDC / Digital Rupee e₹): Sovereign tokenized digital legal tender issued by RBI on distributed ledger, non-interest bearing, fungible 1:1 with physical currency notes.
- RTGS vs NEFT vs IMPS:
  * RTGS (Real Time Gross Settlement): RBI operated, real-time continuous settlement, minimum transaction limit ₹2,00,000, no upper limit, 24x7.
  * NEFT (National Electronic Funds Transfer): RBI operated, batched half-hourly cycles, no minimum or maximum limit, 24x7.
  * IMPS (Immediate Payment Service): NPCI operated, instant 24x7 settlement up to ₹5,00,000.
`.trim();
