// SiteContent — the single source of truth for everything the page says about me.
// Pure data: no DOM, no derived styling, no handlers. The component decorates a copy
// of it in renderVals(), and search-index.js reads the same object to build the
// retrieval index. Anything written directly into the markup instead of here is
// invisible to search, so new prose belongs in this file.
//
// After editing this file, re-run build-vectors.html to refresh search-vectors.js.
// Forgetting is safe — the vectors file stores a hash of the corpus and the site
// falls back to embedding at runtime when it stops matching — but the first search
// gets several seconds slower until you do.
(function () {
  'use strict';

  var SiteContent = {

    // Section order drives the nav, the scroll-spy, and the neural strip's layers.
    // It used to be an `ids` array copy-pasted in three places; this is that array.
    sections: [
      { id: 'about', label: 'About', sys: 'SYS.01', kicker: 'IDENTITY' },
      { id: 'experience', label: 'Experience', sys: 'SYS.02', kicker: 'EXPERIENCE' },
      { id: 'education', label: 'Education', sys: 'SYS.03', kicker: 'EDUCATION' },
      { id: 'projects', label: 'Projects', sys: 'SYS.04', kicker: 'PROJECTS' },
      { id: 'skills', label: 'Skills', sys: 'SYS.05', kicker: 'SKILLS' },
      { id: 'contact', label: 'Contact', sys: 'SYS.06', kicker: 'CONTACT' }
    ],

    // Hero badge under the ASCII name. classLabel/track render on either side of a
    // hardcoded gold "//" separator in Portfolio.jsx — split here so the separator
    // stays a markup glyph and the words stay data.
    hero: {
      classLabel: 'computer_science',
      track: 'AI + ML'
    },

    about: {
      headline: '>> scanning subject: joseph_dipietro...',
      paragraphs: [
        'A junior at WPI with professional experience building production web applications in C#/.NET and Python, and a strong academic and project-based focus on artificial intelligence and machine learning. I\'m Interested in applying software engineering fundamentals to the design and development of intelligent systems.',
        'Finishing my B.S. in Computer Science in 2027, then staying at WPI for the BS/MS program to complete a Master\'s in Artificial Intelligence in a single additional year, graduating in 2028.'
      ],
      // Kept under ~95 chars on purpose: .about-status-type is single-line by
      // design (see styles.css) and doesn't wrap, so a longer line just runs
      // off the panel at narrower pinned widths (900–1000px) instead of fitting.
      status: '>> status: active_process · SWE Intern @ MITRE · open to internships for 2027, full-time 2028'
    },

    experience: [
      // MITRE work is pending public-release review, so this entry stays deliberately
      // non-specific. Replace the bullets and tags once you know what you can describe.
      { id: 'mitre', range: '2026 – Present', role: 'Software Engineering Intern', org: 'MITRE', dotColor: '#fff3d0', logo: './img/mitre.svg', side_logo: './img/mitre-side.svg',
        // Bullets carry no trailing period: buildChunks joins them with '. ', so a
        // period here produces 'team..' in the indexed text.
        bullets: [
          'Working as a software engineer on a federally funded research and development team',
          'Project details are pending public release review — more to follow'
        ],
        tags: ['Software Engineering'] },

      { id: 'dovetail-junior', range: 'Sep 2024 – Aug 2025', role: 'Junior Software Developer', org: 'Dovetail Internet Technologies', dotColor: '#f8d488', logo: './img/dovetail.svg', side_logo: './img/dovetail-side.svg',
        bullets: [
          'Build and maintain features in CyberStore, a C#/.NET e-commerce platform that synchronises inventory, orders, and customer data directly with SYSPRO ERP systems',
          'Work across the full stack of a large ASP.NET application — front-end behaviour in JavaScript and AJAX, business logic in C#, and the SQL underneath it',
          'Deliver sponsored development projects in direct contact with clients, clarifying requirements and shipping to their deadlines',
          // "academic year", not "school year": the latter put a second strong
          // 'school' match in the experience section, which outranked Education on
          // "where does he go to school".
          'Continued on part time through the academic year, running several concurrent assignments against sprint deadlines',
          'Work in a professional Git workflow and agile ceremonies: daily scrums, sprint planning, and reviews'
        ],
        tags: ['C#', '.NET', 'SQL', 'JavaScript'] },

      { id: 'dovetail-intern', range: 'May 2024 – Aug 2024', role: 'DevOps Intern', org: 'Dovetail Internet Technologies', dotColor: '#f8d488', logo: './img/dovetail.svg', side_logo: './img/dovetail-side.svg',
        bullets: [
          'Researched and prototyped a point-of-sale system integration for CyberStore, evaluating hardware requirements and software architecture and contributing production-ready components and proof-of-concept applications',
          'Designed and implemented a C# wrapper library for the UniTerm REST API, enabling communication between the application and POS hardware',
          'Built a demonstration application showing an end-to-end transaction flow through the POS wrapper library',
          'Assisted with bug fixes and maintenance tasks across the existing web application, building familiarity with its architecture'
        ],
        tags: ['C#', 'REST APIs', '.NET'] },

      { id: 'mastercam', range: 'Jun 2022 – Aug 2022', role: 'Software Engineering Intern', org: 'Mastercam', dotColor: '#fff3d0', logo: './img/mastercam.svg', side_logo: './img/mastercam-side.svg',
        bullets: [
          'Contributed to pre-release development of Mastercam products as part of an agile scrum team',
          'Worked daily with software engineers and quality control to identify, resolve, and verify defects',
          'Worked inside a large C++ codebase under established engineering and testing practices'
        ],
        tags: ['C++', 'Scrum'] }
    ],

    // TODO(joseph): years and links are best guesses — confirm real dates and
    // swap in GitHub URLs once repos are public. Model Builder leads on purpose.
    projects: [
      { key: 'model-builder', name: 'model-builder', featured: true,
        image: './img/model-builder.svg', imageAlt: 'A chat prompt resolving into a trained model diagram',
        year: '2026', dotColor: '#fff3d0', link: '#',
        desc: 'A chat-driven web app that lets engineers train, evaluate, and deploy ML models without needing deep ML expertise.',
        longDesc: 'Instead of a hyperparameter-search AutoML dashboard, Model Builder acts like a senior ML engineer doing triage. Describe the data and the goal in plain language, and the system interprets the problem, picks a methodology from a curated library, trains it, and explains why — a "glass-box" alternative to black-box AutoML tools like DataRobot or Vertex AI, where every recommendation is inspectable, not just accurate. It runs on a FastAPI/SQLAlchemy backend and a Next.js/React frontend, with Claude acting as the orchestrating agent through a typed Pydantic tool-calling registry, and scikit-learn, XGBoost, LightGBM, and Prophet doing the actual model training.',
        highlights: ['Core agentic loop: an LLM orchestrator that profiles uploaded data, proposes a training plan via structured tool calls, and interprets results back in plain language, with prompt caching to keep token costs down', 'Multi-modal pipeline architecture: training refactored into a Protocol/registry-based framework (DataSource × TaskRunner) so new data shapes and task families — tabular, timeseries, forecasting — plug in without touching core logic, proven behavior-preserving with golden-output tests', 'Forecasting support: end-to-end time-series pipeline with frequency inference, rolling-origin backtesting, seasonal-naive baselines, Prophet and lag-feature model families, and a hand-rolled SVG forecast chart in the UI', 'Dataset versioning and retraining: immutable dataset versions with replace/append updates, one-click retrain against newer data, and run-comparison cards', 'Tournaments and ensembles: champion/challenger tournaments across candidate methodologies with race-safe promotion logic, plus auto-built blend/stacking ensembles (NNLS weighting and meta-model stacking) using leakage-free out-of-fold predictions', 'Trust and validation layer: automatic leakage detection via correlation-based feature scoring, pre-training warnings surfaced in the UI, and post-training diagnostics — segment-level metrics, calibration curves, single-feature leakage checks', 'Live deployment: promote a trained model to a hosted prediction endpoint served directly by the backend for train/serve consistency by construction, with a live tester, input-contract docs, and serving-vs-training drift monitoring', 'Model recommendation tracking: the agent\'s "this is the model I\'d ship" judgment is captured as first-class project state rather than just chat text, visible as a badge across the UI and revisable on request', 'Deliberately kept some flows (like deployment) button-only/REST rather than adding new LLM tools where the token cost didn\'t justify it, while making model recommendation an explicit tool call, since that judgment call is exactly what the product is selling', 'Design system follows a restrained, Linear-inspired dark UI — no drop shadows, tonal elevation, single emerald accent — to read as a serious engineering tool rather than a consumer AI wrapper'],
        tags: ['FastAPI', 'SQLAlchemy', 'Next.js', 'React', 'Claude', 'scikit-learn', 'XGBoost', 'LightGBM', 'Prophet'] },
      { key: 'mordbot', name: 'mordbot', featured: true,
        image: './img/mordbot.svg', imageAlt: 'A voice waveform feeding into an agent that branches to music and search tools',
        year: '2025', dotColor: '#f8d488', link: '#',
        desc: 'A Discord bot that listens in voice channels, transcribes speech locally, and responds through a tool-calling LLM agent that can search the web, control music playback, and hold a conversation — all running on self-hosted models, no cloud AI dependency.',
        longDesc: 'MordBot is built around a tool-calling agent layer using Pydantic AI, where tools are just typed Python functions — return types, docstrings, and parameter annotations become the JSON schema the LLM sees, so there\'s no hand-maintained schema to keep in sync with the implementation. Around that agent sits a full real-time voice pipeline: audio comes in from a Discord voice channel, gets transcribed locally, and triggers the agent, which can reach for tools or just talk back through local text-to-speech.',
        highlights: ['Typed dependency injection per tool call: each tool receives a RunContext[AgentDeps] carrying guild-scoped state — the music player, the requesting user\'s name, the guild object — rather than reaching for globals, so tools stay pure functions that are easy to test and reason about in isolation', 'Seven tools spanning two domains — music control (play_music, skip_track, pause_music, resume_music, stop_music, show_queue) and web search — registered on a single agent rather than split across specialized sub-agents, deliberately: at this tool count (~1K tokens of schema) a routing/classifier layer would add a full extra LLM round-trip and a misclassification failure mode to save a context budget that was never actually tight', 'Conversation memory that survives trimming: history is stored as whole per-run message chunks, not flattened into a single list, so when old turns get dropped to keep context bounded, a tool call is never orphaned from its result', 'Concurrency-safe by construction: each guild\'s agent session holds its own asyncio.Lock, so if two people in the same voice channel trigger commands close together, the agent processes them one at a time instead of racing on shared conversation state', 'Model-agnostic by design — swapped in a local model served through LM Studio\'s OpenAI-compatible API, but switching to Claude, OpenAI, or any other provider is a one-line config change, not a rewrite, since Pydantic AI abstracts the wire format', 'Real-time voice pipeline: Opus decoding, voice-activity detection, streaming ASR (NVIDIA Nemotron via Hugging Face Transformers), and wake-word triggered command capture, all off the main audio thread', 'Diagnosed and patched a live protocol break when Discord made end-to-end voice encryption (DAVE) mandatory mid-project — traced garbled audio down to the decryption layer and wrote a shim that decrypts incoming E2EE frames using the call\'s own session keys, ahead of upstream library support', 'Local text-to-speech (Kokoro) for spoken replies, including audio-ducking logic that pauses and resumes music around the bot\'s own speech'],
        tags: ['Python', 'Pydantic AI', 'discord.py', 'Hugging Face Transformers', 'LM Studio', 'Kokoro TTS', 'WebRTC VAD'] },
      { key: 'schedule-sync', name: 'workday-to-outlook', featured: false,
        image: './img/workday-to-outlook.svg', imageAlt: 'A spreadsheet grid of classes flowing into a weekly calendar',
        year: '2026', dotColor: '#fff3d0', link: '#',
        desc: 'A tool that turns a WPI Workday class schedule export into Outlook calendar events, so students stop hand-copying their schedule every term.',
        longDesc: 'Every term, WPI students hand-copy their class schedule from Workday into their calendar. Workday exports an .xlsx; Outlook accepts recurring events through the Microsoft Graph API — but nothing connected the two, so this project went through three generations solving the same problem with progressively less friction. The 2024 version was a Python console app: the first working version, and it solved the problem, but it required a local Python environment, so it wasn\'t something that could be handed to another student. The 2025 version rewrote it as a single-page web app so it could be shared as a URL — vanilla JavaScript, MSAL for Microsoft sign-in, SheetJS to parse the spreadsheet in-browser, Microsoft Graph to create events — entirely client-side, so the spreadsheet never leaves the user\'s machine. The 2026 version is a full React/TypeScript/Vite rewrite that adds a proper review step before anything is created, the option to import into an existing calendar instead of only a new one, per-class opt-out, and automatic duplicate detection with an explanation when a class is skipped.',
        highlights: ['2024 — Python console app: the first working version, solved the problem locally but needed a Python environment, so it stayed a personal tool rather than something shareable', '2025 — single-page web app: rewritten in vanilla JavaScript with MSAL for Microsoft sign-in and SheetJS to parse the spreadsheet client-side, built with ChatGPT\'s assistance; entirely client-side, so student data never touches a server', '2026 — React + TypeScript + Vite rewrite (built with Claude Code): adds a review step before anything is created, the option to import into an existing calendar instead of only a new one, per-class opt-out, and automatic duplicate detection with an explanation for skipped classes', 'All scheduling rules — date math and meeting-pattern parsing — live in a lib/ layer that imports no React and makes no network calls, so the logic most worth trusting is directly testable in isolation from the UI, with unit test coverage'],
        tags: ['React', 'TypeScript', 'Vite'] },
      { key: 'permit-compliance', name: 'permit-compliance-leads', featured: false,
        image: './img/permit-compliance-leads.svg', imageAlt: 'A building elevation with permit tags flowing through a rules-check pipeline into a lead list',
        year: '2025', dotColor: '#f8d488', link: '#',
        desc: 'A pipeline that mines public NYC building-permit data for contracting leads — properties with permit filings that hint at compliance gaps and future work.',
        longDesc: 'A friend asked whether public building-permit data could be mined to generate contracting leads. The pipeline pulls recent, unresolved job filings from the NYC Open Data permits dataset (rbx6-tga4) via the Socrata API, filtering to permits issued in the last 90 days that haven\'t been signed off and haven\'t expired. For each job filing, it retrieves and normalizes the associated permits — mapping raw codes like SP, FA, MS to human-readable types: sprinkler, fire alarm, mechanical, and so on — then feeds the permit set to an Azure AI Foundry agent grounded with a custom knowledge base of NYC building, fire, and mechanical code requirements. The agent evaluates each job against those rules and returns structured JSON — any compliance gaps found, with a citation, reasoning, and a confidence score — and high-confidence leads (>0.6) are enriched with applicant and business info and written out to timestamped CSV files as a simple lead database. This was built as a personal exploration of LLM-grounded data pipelines rather than a serious business attempt — permit data is public and low-intent compared to how real contracting leads are actually sourced and sold, so the lead-gen economics don\'t hold up, even though the pipeline itself works end to end.',
        highlights: ['Querying and filtering a public government dataset via a REST/Socrata client (sodapy, pandas), scoped to permits issued in the last 90 days that are unresolved and unexpired', 'Retrieval/grounding pattern: a structured knowledge base of domain rules (building codes) constrains and justifies LLM output rather than relying on the model\'s unverified knowledge', 'Designing and iterating on instructions for an instruct-tuned LLM agent (Azure AI Agents SDK), including a strict input/output JSON contract', 'Structured output per job: compliance gaps with a citation, reasoning, and confidence score, filtered to >0.6 confidence before being treated as a lead', 'End-to-end pipeline design: ingestion, transformation, LLM reasoning, confidence filtering, persisted output', 'Honest framing for the portfolio: a scoped technical exploration rather than a validated product — the business hypothesis was ultimately disproven, but the pipeline demonstrates real applied-LLM and data-engineering skills'],
        tags: ['Python', 'Azure AI Foundry', 'Pandas'] },
      { key: 'rnn-pop', name: 'rnn-pop-generator', featured: false,
        image: './img/rnn-pop-generator.svg', imageAlt: 'A musical staff with notes flowing into a recurrent neural network',
        year: '2024', dotColor: '#f8d488', link: '#',
        desc: 'An LSTM-based recurrent neural network that generates original pop melodies and chord progressions, trained on 909 professionally arranged pop songs.',
        longDesc: 'RNNPopGenerator learns musical patterns — melodic intervals, rhythm, and harmonic movement — from the POP909 dataset and generates new, playable pieces exported as MusicXML. It ingests raw MIDI-derived melody, chord, and key annotations from 909 songs, converts them into a custom tokenized sequence representation, trains a 2-layer LSTM (PyTorch) to predict the next token in a musical sequence, and samples from the trained model to generate new melody/chord sequences that get reconstructed into readable, notated scores. The focus of the work was the data processing pipeline and vocabulary design — turning raw musical annotations into a representation a small model could actually learn from — rather than the model architecture itself.',
        highlights: ['Tokenization pipeline (tokenGen.py) reading per-song melody, chord, and key files and converting them into a unified token stream', 'Key-relative encoding scheme rather than absolute pitches: notes and chords are represented by scale degree (with accidentals) relative to the song\'s key, so the model learns transposition-invariant harmonic patterns instead of memorizing literal notes', 'Melodic motion represented as intervals between consecutive notes (INTERVAL_n) anchored to an initial scale-degree token, dramatically shrinking the space of distinct "note" tokens the model has to learn since a melodic leap is expressed the same way regardless of key or octave', 'Quantized note/rest durations into discrete DUR_* tokens with explicit TIME_SHIFT tokens for rests, giving the model a clean, fixed vocabulary for timing rather than continuous floats', 'Vocabulary generator (vocabTools.py) that scans all 909 tokenized songs, counts token frequency, and builds a compact vocab file sorted by frequency, keeping the model\'s output layer as small as possible while covering every token that actually appears in the corpus', 'Token ↔ ID mapping layer used by both training and generation, decoupling the model\'s numeric ID space from the human-readable token format', 'Iterated on the token schema itself — moved from an absolute degree-based system to an interval-based one, fixed malformed chord tokens like maj7/5 that broke parsing, fixed tokens music21 couldn\'t read — to reduce vocabulary bloat and edge-case failures during training and generation', 'Dataset windowing (TokenDatasetGen.py): a PyTorch Dataset that slides a fixed-length 64-token window over each song\'s token sequence to produce overlapping (input, next-token-target) training pairs across the whole corpus', '2-layer LSTM, embedding dim 128, hidden dim 256, trained with cross-entropy loss, gradient clipping, and an 80/20 train/validation split, reaching a training loss of ~1.2 after iterating on architecture and vocabulary cleanup', 'Generation uses temperature-controlled sampling and reconstructs output back into notated MusicXML via a reverse-token-to-score module'],
        tags: ['Python', 'PyTorch', 'music21', 'LSTM'] }
    ],

    skills: [
      { id: 'languages', title: 'LANGUAGES', items: ['Python', 'TypeScript', 'C#', 'SQL', 'C++', 'C', 'JavaScript'] },
      { id: 'frameworks', title: 'LIBRARIES & FRAMEWORKS', items: ['React', 'Next.js', 'FastAPI', 'Pydantic AI', '.NET Framework', 'ASP.NET', 'PyTorch', 'scikit-learn', 'XGBoost', 'LightGBM', 'Prophet', 'Pandas', 'SQLAlchemy', 'Flask', 'discord.py', 'Hugging Face Transformers', 'music21', 'pytest', 'DevExpress'] },
      { id: 'practices', title: 'PRACTICES & TOOLS', items: ['REST APIs', 'Object-Oriented Design', 'Scrum / Agile', 'Git', 'Azure', 'Azure AI', 'Anthropic API', 'Microsoft Graph API', 'Socrata API'] }
    ],

    skillsBlurb: 'The tools I work in. Where each one was used is on the roles and projects above.',

    education: {
      institution: 'Worcester Polytechnic Institute',
      degree: 'B.S. in Computer Science',
      focus: 'Artificial Intelligence & Machine Learning',
      graduation: 'Expected 2027',
      masters: 'M.S. in Artificial Intelligence (WPI BS/MS), expected 2028',
      honors: 'Dean\'s List (2023–present) · Presidential Scholarship',
      // No GPA here on purpose. It isn't displayed, and a field that only search
      // can see is a field that answers a question the page then can't show you.
      coursework: ['Machine Learning', 'Introduction to AI', 'Algorithms', 'Operating Systems', 'Database Systems', 'Software Engineering', 'Systems Programming', 'Object-Oriented Design', 'Machine Organization & Assembly', 'Linear Algebra', 'Probability & Statistics', 'Discrete Math']
    },

    // The contact section was pure markup before search existed; it lives here now so
    // "how do I get in touch" is answerable.
    contact: {
      headline: '>> establish_connection()',
      blurb: 'Channel open. Send a signal, I\'ll respond.',
      searchBlurb: 'Get in touch by email, GitHub, or LinkedIn. My resume is available to download.',
      email: 'jdipietro3@hotmail.com',
      links: [
        // TODO(joseph): GitHub URL and a real resume.pdf still needed.
        { label: 'GitHub', href: '#' },
        { label: 'LinkedIn', href: 'https://www.linkedin.com/in/joseph-dipietro-6203a037a/' },
        { label: './resume.pdf', href: '#' }
      ],
      footer: '© 2026 Joseph DiPietro — built from scratch... with a little help'
    },

    // Shown in the search palette before anything is typed.
    suggestions: [
      'What has he built with C#?',
      'Does he have machine learning experience?',
      'Where does he go to school?',
      'How do I get in touch?'
    ]
  };

  window.SiteContent = SiteContent;
})();
