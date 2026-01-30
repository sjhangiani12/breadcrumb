export function initCopyButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        btn.dataset.copied = 'true';
        setTimeout(() => {
          delete btn.dataset.copied;
        }, 1500);
      } catch {
        // Clipboard API not available
      }
    });
  });
}
