import { delay, prefersReducedMotion } from '../lib/utils';

const MESSAGE_IDS = ['slack-msg-0', 'slack-msg-1', 'slack-msg-2', 'slack-msg-3', 'slack-msg-4'];

function showAllInstantly(): void {
  const slackWindow = document.querySelector<HTMLElement>('.slack-window');
  if (slackWindow) {
    slackWindow.style.opacity = '1';
    slackWindow.style.transform = 'none';
  }

  document.querySelectorAll<HTMLElement>('.slack-msg').forEach((msg) => {
    msg.style.opacity = '1';
    msg.style.transform = 'none';
  });
}

async function animateSlack(): Promise<void> {
  const slackWindow = document.querySelector<HTMLElement>('.slack-window');
  if (!slackWindow) return;

  // Fade in the window
  await slackWindow.animate(
    [
      { opacity: 0, transform: 'scale(0.98)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    { duration: 400, easing: 'cubic-bezier(0.165, 0.84, 0.44, 1)', fill: 'forwards' },
  ).finished;

  await delay(300);

  // Animate each message in sequence
  for (const id of MESSAGE_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;

    await el.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 350, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' },
    ).finished;

    await delay(600);
  }
}

export async function playHeroAnimation(): Promise<void> {
  if (prefersReducedMotion()) {
    showAllInstantly();
    return;
  }

  await animateSlack();
}
