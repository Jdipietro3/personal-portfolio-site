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

    about: {
      headline: '>> scanning subject: joseph_dipietro...',
      paragraphs: [
        'Computer Science at WPI, with a professional half and an academic half that keep pulling on each other. The day job has been production software with real customers behind it — a C#/.NET commerce platform wired straight into ERP systems, where a bad query is somebody\'s inventory. The coursework and the side projects are artificial intelligence and machine learning.',
        'The part I actually care about is the seam between those two. Plenty of people can train a model; fewer have shipped anything on a deadline to a client who noticed. I\'m interested in what happens when you point real engineering discipline — reviews, tests, release pressure — at systems that learn instead of systems that merely run.'
      ],
      // TODO(joseph): confirm — assumes you're targeting full-time for after May 2027.
      status: '>> status: active_process · SWE Intern @ MITRE · open to full-time SWE roles for 2027'
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

      { id: 'dovetail', range: 'May 2024 – Present', role: 'Junior Software Developer', org: 'Dovetail Internet Technologies', dotColor: '#f8d488', logo: './img/dovetail.svg', side_logo: './img/dovetail-side.svg',
        bullets: [
          'Build and maintain features in CyberStore, a C#/.NET e-commerce platform that synchronises inventory, orders, and customer data directly with SYSPRO ERP systems',
          'Work across the full stack of a large ASP.NET application — front-end behaviour in JavaScript and AJAX, business logic in C#, and the SQL underneath it',
          'Deliver sponsored development projects in direct contact with clients, clarifying requirements and shipping to their deadlines',
          // "academic year", not "school year": the latter put a second strong
          // 'school' match in the experience section, which outranked Education on
          // "where does he go to school".
          'Started as a summer intern and stayed on part time through the academic year, running several concurrent assignments against sprint deadlines',
          'Work in a professional Git workflow and agile ceremonies: daily scrums, sprint planning, and reviews'
        ],
        tags: ['C#', '.NET', 'SQL', 'JavaScript'] },

      { id: 'mastercam', range: 'Jun 2022 – Aug 2022', role: 'Software Engineering Intern', org: 'Mastercam', dotColor: '#fff3d0', logo: './img/mastercam.svg', side_logo: './img/mastercam-side.svg',
        bullets: [
          'Contributed to pre-release development of Mastercam products as part of an agile scrum team',
          'Worked daily with software engineers and quality control to identify, resolve, and verify defects',
          'Worked inside a large C++ codebase under established engineering and testing practices'
        ],
        tags: ['C++', 'Scrum'] }
    ],

    // TODO(joseph): still placeholder — the two real ones from the résumé are the
    // Azure AI permit-gap analyser and the PyTorch RNN pop-music generator.
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
      { id: 'languages', title: 'LANGUAGES', items: ['Python', 'C#', 'SQL', 'C++', 'C', 'JavaScript'] },
      { id: 'frameworks', title: 'LIBRARIES & FRAMEWORKS', items: ['.NET Framework', 'ASP.NET', 'PyTorch', 'scikit-learn', 'Pandas', 'Flask', 'SQLAlchemy', 'pytest', 'DevExpress'] },
      { id: 'practices', title: 'PRACTICES & TOOLS', items: ['REST APIs', 'Object-Oriented Design', 'Scrum / Agile', 'Git', 'Azure', 'Azure AI'] }
    ],

    skillsBlurb: 'The tools I work in. Where each one was used is on the roles and projects above.',

    education: {
      institution: 'Worcester Polytechnic Institute',
      degree: 'B.S. in Computer Science',
      focus: 'Artificial Intelligence & Machine Learning',
      graduation: 'Expected 2027',
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
      footer: '© 2026 Joseph DiPietro — built from scratch, compiled with care.'
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
