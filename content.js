// SiteContent — the single source of truth for everything the page says about me.
// Pure data: no DOM, no derived styling, no handlers. The component decorates a copy
// of it in renderVals(), and search-index.js reads the same object to build the
// retrieval index. Anything written directly into the markup instead of here is
// invisible to search, so new prose belongs in this file.
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

    about: {
      headline: '>> scanning subject: joseph_dipietro...',
      paragraphs: [
        'A Computer Science mind drawn to the systems underneath other systems — compilers, distributed protocols, and the models that learn from them. Not much interested in the surface. More interested in what\'s running underneath it.'
      ],
      status: '>> status: active_process · TA — Data Structures & Algorithms · signal open for summer \'27'
    },

    experience: [
      { id: 'nsl', range: 'Jan 2025 – Present', role: 'Undergraduate Research Assistant', org: 'Neural Systems Lab', dotColor: '#fff3d0',
        bullets: ['Trained and evaluated sequence models on a 40M-token internal corpus', 'Built the lab’s experiment-tracking harness, now used by six researchers', 'Co-authored a workshop paper on attention sparsity'],
        tags: ['Python', 'PyTorch', 'Transformers'] },
      { id: 'acme', range: 'Jun 2025 – Aug 2025', role: 'Software Engineering Intern', org: 'Acme Systems', dotColor: '#f8d488',
        bullets: ['Built internal CI tooling that cut average build time by 30%', 'Shipped REST API endpoints consumed by four downstream teams', 'Raised integration test coverage from 62% to 88%'],
        tags: ['Go', 'Docker', 'PostgreSQL'] },
      { id: 'ta', range: 'Sep 2024 – Present', role: 'Teaching Assistant, Data Structures & Algorithms', org: 'University CS Department', dotColor: '#fff3d0',
        bullets: ['Ran weekly office hours for 40+ students', 'Wrote and graded exam problems on trees, graphs, and DP', 'Led review sessions before midterms and finals'],
        tags: ['Java', 'Teaching'] },
      { id: 'riverbend', range: 'Jun 2024 – Aug 2024', role: 'Software Developer Intern', org: 'Riverbend Labs', dotColor: '#f8d488',
        bullets: ['Migrated a legacy service to TypeScript, improving type safety', 'Implemented a caching layer that cut API latency by 40%', 'Partnered with design to ship a new internal dashboard'],
        tags: ['TypeScript', 'React', 'Redis'] }
    ],

    projects: [
      { key: 'raft', name: 'kvstore-raft', featured: true,
        image: './img/kvstore-raft.svg', imageAlt: 'Diagram of a five-node cluster with one elected leader',
        year: '2025', dotColor: '#fff3d0', link: '#',
        desc: 'Distributed key-value store with Raft consensus, leader election, and log replication.',
        longDesc: 'A from-scratch implementation of the Raft consensus protocol backing a replicated key-value store. Nodes hold an election when the leader stops heartbeating, and committed entries replicate to a majority before the write is acknowledged.',
        highlights: ['Leader election with randomised timeouts to avoid split votes', 'Log replication with conflict resolution on rejoin', 'Snapshotting so the log does not grow without bound', 'Tested against injected network partitions with netem'],
        tags: ['Go', 'gRPC', 'Raft', 'Docker'] },
      { key: 'toylang', name: 'toylang-compiler', featured: true,
        image: './img/toylang-compiler.svg', imageAlt: 'Diagram of a syntax tree descending from a root node',
        year: '2025', dotColor: '#f8d488', link: '#',
        desc: 'Compiler for a C-like toy language: hand-written lexer, parser, and x86 codegen backend.',
        longDesc: 'A complete compiler front-to-back with no parser generator involved. Source becomes tokens, tokens become an AST by recursive descent, and the AST lowers to x86-64 assembly that links against libc and runs natively.',
        highlights: ['Hand-written lexer and recursive-descent parser', 'Typed AST with a resolution pass before codegen', 'x86-64 backend emitting linkable assembly', 'Differential test harness diffing output against a reference interpreter'],
        tags: ['C++', 'LLVM', 'x86-64'] },
      { key: 'pathviz', name: 'pathfinder.viz', featured: false,
        image: './img/pathfinder-viz.svg', imageAlt: 'A maze grid with a solved path running through it',
        year: '2024', dotColor: '#f8d488', link: '#',
        desc: 'Interactive pathfinding visualizer comparing A*, Dijkstra, and BFS on generated mazes.',
        longDesc: 'Draw walls, drop a start and a goal, then watch three algorithms explore the same maze side by side. Every frame of the search is steppable, so the difference between an informed and an uninformed search is something you can watch rather than read about.',
        highlights: ['A*, Dijkstra, and breadth-first search on a shared grid', 'Step, play, and scrub through the frontier as it expands', 'Procedural maze generation with adjustable density'],
        tags: ['JavaScript', 'Canvas'] },
      { key: 'digits', name: 'digit-classifier', featured: false,
        image: './img/digit-classifier.svg', imageAlt: 'A coarse pixel grid resolving into a handwritten digit',
        year: '2024', dotColor: '#f8d488', link: '#',
        desc: 'Convolutional neural network for handwritten digit recognition, trained on MNIST.',
        longDesc: 'A small convolutional network trained on MNIST, plus the tooling around it that made the accuracy number trustworthy: a held-out split, a confusion matrix, and a viewer for the cases it got wrong.',
        highlights: ['Two convolutional blocks into a dense classifier head', 'Augmentation with small rotations and shifts', 'Confusion matrix and misclassification viewer for error analysis'],
        tags: ['Python', 'PyTorch', 'NumPy'] },
      { key: 'chat', name: 'realtime-chat', featured: false,
        image: null, imageAlt: '',
        year: '2024', dotColor: '#fff3d0', link: '#',
        desc: 'Multi-room chat application with presence indicators and typing state over WebSockets.',
        longDesc: 'Multi-room chat over a single WebSocket connection, with presence and typing state that stay correct when connections drop. Reconnect replays anything missed rather than leaving a hole in the transcript.',
        highlights: ['One multiplexed socket across all joined rooms', 'Presence and typing state expiring per connection', 'Reconnect with replay of missed messages'],
        tags: ['React', 'Node.js', 'WebSockets', 'Redis'] }
    ],

    skills: [
      { id: 'languages', title: 'LANGUAGES', items: ['Python', 'TypeScript', 'Go', 'SQL', 'Java', 'C++'] },
      { id: 'systems', title: 'SYSTEMS & INFRASTRUCTURE', items: ['Linux', 'Docker', 'PostgreSQL', 'Redis', 'gRPC', 'AWS'] },
      { id: 'ml', title: 'MACHINE LEARNING', items: ['PyTorch', 'NumPy', 'CUDA', 'Transformers'] }
    ],

    skillsBlurb: 'The tools I work in. Where each one was used is on the roles and projects above.',

    education: {
      institution: 'State University', degree: 'B.S. in Computer Science', focus: 'Systems & Artificial Intelligence',
      graduation: 'Expected May 2026', gpa: '3.85 / 4.0', gpaPct: 96,
      coursework: ['Algorithms', 'Operating Systems', 'Computer Networks', 'Machine Learning', 'Database Systems', 'Compilers']
    },

    // The contact section was pure markup before search existed; it lives here now so
    // "how do I get in touch" is answerable.
    contact: {
      headline: '>> establish_connection()',
      blurb: 'Channel open. Send a signal, I\'ll respond.',
      searchBlurb: 'Get in touch by email, GitHub, or LinkedIn. My resume is available to download.',
      email: 'joseph.dipietro@example.com',
      links: [
        { label: 'GitHub', href: '#' },
        { label: 'LinkedIn', href: '#' },
        { label: './resume.pdf', href: '#' }
      ],
      footer: '© 2026 Joseph DiPietro — built from scratch, compiled with care.'
    },

    // Shown in the search palette before anything is typed.
    suggestions: [
      'What has he built with Go?',
      'Does he have machine learning experience?',
      'Has he taught anyone?',
      'How do I get in touch?'
    ]
  };

  window.SiteContent = SiteContent;
})();
