import { formatArea, formatRatio } from '../domain/format';
import type { Slot } from '../state/appState';
import { h } from './dom';

export interface AreaFigures {
  readonly name: string;
  readonly cityAreaM2: number;
  readonly metroAreaM2: number | null;
}

export class ComparisonPanel {
  private readonly cards: Record<Slot, { name: HTMLElement; city: HTMLElement; metro: HTMLElement }>;
  private readonly summary: HTMLElement;

  constructor(container: HTMLElement) {
    const card = (slot: Slot): { el: HTMLElement; name: HTMLElement; city: HTMLElement; metro: HTMLElement } => {
      const name = h('p', { class: 'stat-name' });
      const city = h('p', { class: 'stat-value' });
      const metro = h('p', { class: 'stat-sub' });
      return { el: h('div', { class: `stat slot-${slot}` }, [name, city, metro]), name, city, metro };
    };
    const a = card('a');
    const b = card('b');
    this.cards = { a, b };
    this.summary = h('div', { class: 'ratio', attrs: { 'aria-live': 'polite' } });
    container.append(h('h2', { class: 'section-title', text: 'Area comparison' }), h('div', { class: 'stats' }, [a.el, b.el]), this.summary);
  }

  update(figures: Partial<Record<Slot, AreaFigures>>, showMetro: boolean): void {
    for (const slot of ['a', 'b'] as const) {
      const f = figures[slot];
      const card = this.cards[slot];
      card.name.textContent = f?.name ?? 'Loading…';
      card.city.textContent = f ? formatArea(f.cityAreaM2) : '—';
      card.metro.textContent = !f || !showMetro ? '' : f.metroAreaM2 ? `Metro ${formatArea(f.metroAreaM2)}` : 'Metro area n/a';
    }
    const { a, b } = figures;
    if (!a || !b) {
      this.summary.replaceChildren('Loading boundaries…');
      return;
    }
    const lines = [sentence(a.name, a.cityAreaM2, b.name, b.cityAreaM2, 'city limits')];
    if (showMetro && a.metroAreaM2 && b.metroAreaM2) lines.push(sentence(a.name, a.metroAreaM2, b.name, b.metroAreaM2, 'metro areas'));
    this.summary.replaceChildren(...lines);
  }
}

function sentence(nameA: string, areaA: number, nameB: string, areaB: number, scope: string): HTMLElement {
  const [big, bigArea, small, smallArea] = areaA >= areaB ? [nameA, areaA, nameB, areaB] : [nameB, areaB, nameA, areaA];
  return h('p', {}, [h('strong', { text: big }), ' is ', h('strong', { text: formatRatio(bigArea, smallArea) }), ' the size of ', h('strong', { text: small }), ` (${scope})`]);
}
