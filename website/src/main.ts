import './styles/reset.css';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/animations.css';

import { playHeroAnimation } from './sections/hero';
import { initCopyButtons } from './sections/copy-button';

document.addEventListener('DOMContentLoaded', () => {
  initCopyButtons();
  playHeroAnimation();
});
