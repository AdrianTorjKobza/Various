/** Short, polite status messages announced to screen readers. */
export class Toast {
  private timer = 0;

  constructor(private readonly el: HTMLElement) {}

  show(message: string, durationMs = 2_500): void {
    window.clearTimeout(this.timer);
    this.el.textContent = message;
    this.el.classList.add('is-visible');
    this.timer = window.setTimeout(() => this.el.classList.remove('is-visible'), durationMs);
  }
}
