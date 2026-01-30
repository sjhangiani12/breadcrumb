export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hasPlayedIntro(): boolean {
  try {
    return sessionStorage.getItem('bc-intro-played') === '1';
  } catch {
    return false;
  }
}

export function markIntroPlayed(): void {
  try {
    sessionStorage.setItem('bc-intro-played', '1');
  } catch {
    // sessionStorage unavailable
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
