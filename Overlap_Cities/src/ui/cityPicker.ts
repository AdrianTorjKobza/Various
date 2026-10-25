import { flagEmoji } from '../domain/format';
import type { CitySearchIndex } from '../domain/search';
import type { CitySummary } from '../domain/types';
import type { Slot } from '../state/appState';
import { h, uniqueId } from './dom';

/** Accessible combobox (WAI-ARIA 1.2 pattern) for searching and picking a city. */
export class CityPicker {
  private readonly input: HTMLInputElement;
  private readonly list: HTMLUListElement;
  private results: CitySummary[] = [];
  private highlighted = -1;
  private selected: CitySummary | null = null;

  constructor(
    container: HTMLElement,
    slot: Slot,
    label: string,
    private readonly index: CitySearchIndex,
    private readonly onSelect: (city: CitySummary) => void,
  ) {
    const inputId = uniqueId('city-input');
    const listId = uniqueId('city-list');
    this.input = h('input', {
      class: 'picker-input',
      attrs: {
        id: inputId,
        type: 'text',
        role: 'combobox',
        autocomplete: 'off',
        autocapitalize: 'words',
        spellcheck: 'false',
        maxlength: '60',
        'aria-autocomplete': 'list',
        'aria-expanded': 'false',
        'aria-controls': listId,
        placeholder: 'Search a city',
      },
    });
    this.list = h('ul', { class: 'picker-list', attrs: { id: listId, role: 'listbox', 'aria-label': `${label} suggestions` } });
    this.list.hidden = true;

    container.append(
      h('label', { class: `picker-label slot-${slot}`, attrs: { for: inputId } }, [h('span', { class: 'swatch', attrs: { 'aria-hidden': 'true' } }), label]),
      h('div', { class: 'picker' }, [this.input, this.list]),
    );
    this.bind();
  }

  setCity(city: CitySummary): void {
    this.selected = city;
    if (document.activeElement !== this.input) this.input.value = city.name;
  }

  private bind(): void {
    this.input.addEventListener('focus', () => {
      this.input.select();
      this.open(this.index.search(''));
    });
    this.input.addEventListener('input', () => this.open(this.index.search(this.input.value)));
    this.input.addEventListener('blur', () => {
      this.close();
      if (this.selected) this.input.value = this.selected.name;
    });
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    // mousedown (not click) so the choice lands before the input blurs.
    this.list.addEventListener('mousedown', (e) => {
      const option = (e.target as Element).closest<HTMLLIElement>('[role="option"]');
      if (!option) return;
      e.preventDefault();
      this.choose(Number(option.dataset['index']));
    });
  }

  private onKey(e: KeyboardEvent): void {
    const count = this.results.length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault();
        if (this.list.hidden) this.open(this.index.search(this.input.value));
        else if (count) this.highlight((this.highlighted + (e.key === 'ArrowDown' ? 1 : -1) + count) % count);
        break;
      case 'Enter':
        if (!this.list.hidden && count) {
          e.preventDefault();
          this.choose(Math.max(this.highlighted, 0));
        }
        break;
      case 'Escape':
        this.close();
        if (this.selected) this.input.value = this.selected.name;
        break;
    }
  }

  private open(results: CitySummary[]): void {
    this.results = results;
    this.highlighted = -1;
    this.list.replaceChildren(
      ...(results.length
        ? results.map((city, i) =>
            h('li', { class: 'picker-option', attrs: { id: `${this.list.id}-${i}`, role: 'option', 'aria-selected': 'false', 'data-index': String(i) } }, [
              h('span', { class: 'option-name', text: `${flagEmoji(city.countryCode)} ${city.name}` }),
              h('span', { class: 'option-meta', text: `${city.country} · ${city.region}` }),
            ]),
          )
        : [h('li', { class: 'picker-empty', text: 'No matching city' })]),
    );
    this.list.hidden = false;
    this.input.setAttribute('aria-expanded', 'true');
    this.input.removeAttribute('aria-activedescendant');
  }

  private close(): void {
    this.list.hidden = true;
    this.input.setAttribute('aria-expanded', 'false');
    this.input.removeAttribute('aria-activedescendant');
  }

  private highlight(index: number): void {
    this.highlighted = index;
    Array.from(this.list.children).forEach((el, i) => el.setAttribute('aria-selected', String(i === index)));
    const active = this.list.children[index];
    if (active) {
      this.input.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  private choose(index: number): void {
    const city = this.results[index];
    if (!city) return;
    this.selected = city;
    this.input.value = city.name;
    this.close();
    this.input.blur();
    this.onSelect(city);
  }
}
