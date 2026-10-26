import type { AppState, Slot } from '../state/appState';
import { h, uniqueId } from './dom';

export interface ControlsEvents {
  onShowMetro(show: boolean): void;
  onActive(slot: Slot): void;
  onRotation(degrees: number): void;
  onOpacity(opacity: number): void;
  onSwap(): void;
  onReset(): void;
  onShare(): void;
}

export interface ControlsModel {
  readonly state: AppState;
  readonly names: Readonly<Record<Slot, string>>;
  readonly metroAvailable: boolean;
}

interface SliderRow {
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

export class ControlsPanel {
  private readonly metro: HTMLInputElement;
  private readonly metroHint: HTMLElement;
  private readonly activeButtons: Record<Slot, HTMLButtonElement>;
  private readonly rotation: SliderRow;
  private readonly opacity: SliderRow;

  constructor(container: HTMLElement, events: ControlsEvents) {
    this.metro = h('input', { attrs: { type: 'checkbox' } });
    this.metro.addEventListener('change', () => events.onShowMetro(this.metro.checked));
    this.metroHint = h('p', { class: 'hint', text: 'Metro area data is not available for these cities.' });

    const activeButton = (slot: Slot): HTMLButtonElement => {
      const button = h('button', { class: `chip slot-${slot}`, attrs: { type: 'button', 'aria-pressed': 'false' } });
      button.addEventListener('click', () => events.onActive(slot));
      return button;
    };
    this.activeButtons = { a: activeButton('a'), b: activeButton('b') };

    this.rotation = slider('Rotate', -180, 180, 1, (v) => events.onRotation(v));
    this.opacity = slider('Opacity', 10, 90, 1, (v) => events.onOpacity(v / 100));

    const button = (label: string, onClick: () => void, extra = ''): HTMLButtonElement => {
      const el = h('button', { class: `btn ${extra}`.trim(), text: label, attrs: { type: 'button' } });
      el.addEventListener('click', onClick);
      return el;
    };

    container.append(
      h('div', { class: 'control-group' }, [h('label', { class: 'toggle' }, [this.metro, h('span', { text: 'Show metro area' })]), this.metroHint]),
      h('div', { class: 'control-group' }, [
        h('p', { class: 'section-title', text: 'Adjust city' }),
        h('div', { class: 'chips', attrs: { role: 'group', 'aria-label': 'City to adjust' } }, [this.activeButtons.a, this.activeButtons.b]),
        this.rotation.input.closest('.slider-row') as HTMLElement,
        this.opacity.input.closest('.slider-row') as HTMLElement,
        h('p', { class: 'hint', text: 'Tip: drag either city. Tap a city to select it here.' }),
      ]),
      h('div', { class: 'actions' }, [button('Swap', events.onSwap), button('Reset', events.onReset), button('Share link', events.onShare, 'btn-primary')]),
    );
  }

  update({ state, names, metroAvailable }: ControlsModel): void {
    this.metro.checked = state.showMetro;
    this.metroHint.hidden = !state.showMetro || metroAvailable;

    for (const slot of ['a', 'b'] as const) {
      this.activeButtons[slot].textContent = names[slot];
      this.activeButtons[slot].setAttribute('aria-pressed', String(state.active === slot));
    }
    const active = state.slots[state.active];
    setSlider(this.rotation, active.rotation, `${active.rotation}°`);
    setSlider(this.opacity, Math.round(active.opacity * 100), `${Math.round(active.opacity * 100)}%`);
  }
}

/** Label | slider | value on a shared grid, so every slider has exactly the same width. */
function slider(label: string, min: number, max: number, step: number, onInput: (value: number) => void): SliderRow {
  const id = uniqueId('slider');
  const input = h('input', { attrs: { id, type: 'range', min: String(min), max: String(max), step: String(step) } });
  const output = h('output', { class: 'slider-value', attrs: { for: id } });
  input.addEventListener('input', () => onInput(Number(input.value)));
  h('div', { class: 'slider-row' }, [h('label', { text: label, attrs: { for: id } }), input, output]);
  return { input, output };
}

function setSlider(row: SliderRow, value: number, label: string): void {
  if (row.input.valueAsNumber !== value) row.input.value = String(value);
  row.output.value = label;
}
