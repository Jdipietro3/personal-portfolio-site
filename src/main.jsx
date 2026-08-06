import React from 'react';
import { createRoot } from 'react-dom/client';

// Must run before anything can open the search palette. Sets window.loadTransformers.
import './transformers-loader.js';
import './styles.css';

import Portfolio from './Portfolio.jsx';

// Deliberately NOT wrapped in <React.StrictMode>. StrictMode double-invokes the
// constructor and mount/unmount in development, which would run the rAF draw loop
// and the scroll/resize/keydown listener registration twice — behaviour the
// dc-runtime original never had. Keeping it off preserves a like-for-like port.
createRoot(document.getElementById('root')).render(<Portfolio />);
