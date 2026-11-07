# 🏦 IBPS AI Interview Board (`ibps-ai-panel`)

An open-source, ultra-realistic **4-Member AI Interview Board** for **IBPS PO** and **SBI PO** aspirants, powered by **Gemini Live 3.8 Multimodal Audio** (`@google/genai` Live WebSocket API).

Simulates the high-pressure, authentic 20-minute personality assessment conducted by public sector banks in India, complete with real-time central banking regulatory grilling, regional rural branch scenarios, webcam posture analysis, and an official **100-mark evaluation scorecard**.

---

## 🏛️ The 4-Panelist Board & Voice Personas

In a genuine IBPS PO interview board, candidates face four distinct senior panelists across banking, regulation, academia, and branch operations. Each panelist runs on an independent sub-session with a tailored voice persona:

| Seat | Panelist | Title / Role Focus | Gemini Voice | Persona & Cadence |
|---|---|---|---|---|
| **Seat 1** | **Shri R.K. Deshmukh** | **Chairman of the Board** (Retd. CMD, Public Sector Bank)<br/>*Welcome, Graduation Transition, Career Motivation & Gaps* | `Charon` | Measured, grandfatherly, deeply discerning; probes why candidates leave technical/commerce fields for banking. |
| **Seat 2** | **Shri S. Narayanan** | **RBI Nominee** (Central Banking Regulatory Expert)<br/>*Monetary Policy, Core Banking, Repo/SDF, NPAs & PSL* | `Fenrir` | Crisp, sharp, authoritative central banker; tests precision against RBI 2026 norms and penalizes factual bluffing. |
| **Seat 3** | **Dr. Kavita Verma** | **Academic Nominee** (Professor of Economics)<br/>*Degree Application, Macroeconomics, Union Budget, Capex* | `Kore` | Articulate, intellectual, probing; asks how academic degrees (B.Tech, B.Com, B.Sc) apply to national credit growth. |
| **Seat 4** | **Shri Rajeshwar Rao** | **CGM HR & Rural Operations**<br/>*Branch Crises, Ethics, Hindi/Regional Readiness, Stress Tolerance* | `Puck` | Grounded, street-smart veteran; switches to conversational Hindi/Hinglish to test empathy with rural farmers and angry customers. |

---

## ⚡ Technical Architecture

```
                                  +------------------------------------------------------+
                                  |         Candidate Browser Interface                  |
                                  |  - 16kHz Web Audio Capture (ScriptProcessor / Audio) |
                                  |  - 24kHz Gapless Audio Playback Queue                |
                                  |  - Real-time Bidirectional Subtitles & Posture Cam   |
                                  +---------------------------+--------------------------+
                                                              |
                                           WebSocket (@google/genai ai.live.connect)
                                                              |
                                                              v
+-------------------------------------------------------------------------------------------------------------------------+
|                                              Google Gemini Live 3.8 Engine                                              |
|                                                                                                                         |
|    +-----------------------------+    +-----------------------------+    +-----------------------------------------+    |
|    |    Seat 1: Chairman         |    |    Seat 2: RBI Nominee      |    |    Seat 3: Academician / Seat 4: HR CGM |    |
|    |    Voice: Charon            |--->|    Voice: Fenrir            |--->|    Voice: Kore / Puck                   |    |
|    |    (Background & Career)    |    |    (RBI 2026 Factsheet)     |    |    (Degree Cross-Questions & Scenarios)|    |
|    +-----------------------------+    +-----------------------------+    +-----------------------------------------+    |
|                                                                                                                         |
|             Turn Orchestration via tool call: `hand_over_to_next_panelist(next_seat, handover_remark)`                  |
|                                         or Manual Pass-Mic UI Override                                                  |
+-------------------------------------------------------------------------------------------------------------------------+
                                                              |
                                                 Interview Disconnect / Complete
                                                              |
                                                              v
                                  +------------------------------------------------------+
                                  |         100-Mark Evaluation Engine (`/api/evaluate`)  |
                                  |  - Gemini 3.8 Flash structured rubric evaluation     |
                                  |  - RBI 2026 factsheet ground-truth verification     |
                                  |  - Honesty / Anti-bluff deduction                    |
                                  |  - Multimodal webcam posture synthesis               |
                                  +------------------------------------------------------+
```

### Key Audio & Voice Features:
1. **16 kHz 16-Bit PCM Mic Streaming:** Browser captures audio at native rates, resamples to 16,000 Hz, encodes to signed 16-bit PCM base64, and streams directly into Gemini Live.
2. **24 kHz Gapless Audio Scheduling:** Output PCM audio chunks from Gemini are scheduled with sub-millisecond precision on Web Audio `AudioBufferSourceNode` queues.
3. **Real-time Interruption & Barge-in:** When the candidate speaks over a panelist or clicks **⚡ Interrupt**, output buffers are immediately flushed.
4. **Autonomous Sub-Session Handoff:** Panelists invoke `hand_over_to_next_panelist` after asking their allotted questions, handing off to the next board member with conversational handover remarks. Candidates can also click **"Pass Mic to Next Member &rarr;"** anytime.
5. **Silent / Fallback Mode:** Candidates in quiet environments can type answers or use the **"Simulate Realistic Answer"** button for quick 30-second full board demonstrations.

---

## 🎯 IBPS 100-Mark Scoring Rubric

The evaluation engine adheres to the standard 100-mark IBPS Probationary Officer board scoring criteria:

1. **Banking & Economic Awareness (30 Marks):**
   - Verified against the **Official RBI 2026 Benchmark Factsheet** (Repo 6.50%, SDF 6.25%, CRR 4.50%, SLR 18.00%, PSL 40% targets, SARFAESI 2002, IBC 2016, PMJDY, and UPI/CBDC mechanisms).
2. **Personal Profile & Career Conviction (25 Marks):**
   - Assesses justification for graduation transition, handling of career gaps, and genuine motivation for public sector service.
3. **Situational & Officer Qualities (20 Marks):**
   - Evaluates branch conflict de-escalation, empathy for rural customers, and ethical integrity.
4. **Honesty & Anti-Bluff Detection (15 Marks):**
   - **Crucial Rule:** In public sector interviews, politely stating *"I am unable to recall the exact figure at this moment, sir"* earns higher credit than fabricating wrong figures. The evaluator flags bluffs and deducts marks accordingly.
5. **Communication & Body Language (10 Marks):**
   - Analyzes periodic webcam snapshots for posture, steady eye level, and verbal composure.

---

## 🚀 Quickstart & Setup

### Prerequisites
- Node.js 18+
- A Google Gemini API key (from [Google AI Studio](https://aistudio.google.com/))

### 1. Installation
```bash
git clone https://github.com/vaibhavmisra/ibps-ai-panel.git
cd ibps-ai-panel
npm install
```

### 2. Configure API Key
Create a `.env.local` file in the project root:
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

*(Alternatively, you can provide your API key directly in the web browser UI — it is stored in `localStorage` under `ibps_gemini_api_key` and sent via the `x-gemini-api-key` header).*

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧭 Application Routes

- `/` — **Candidate DAF & Profile Setup:** Detailed Application Form, resume upload/paste auto-parser, pre-interview dossier generator.
- `/room` — **Live 4-Member Boardroom:** Real-time Gemini Live voice interaction, animated speaker visualizers, pass-mic controls, live dual-channel transcript, and posture mirror.
- `/report` — **100-Mark Debrief Scorecard:** Category score breakdowns, question-by-question model answers, flagged bluffs, strengths & action items, and printable report.

---

## 📄 License
MIT License. Open-source contribution to banking aspirants across India.
