import type { AppConfig } from './config';
import { buildShapes } from './domain/geo';
import { CitySearchIndex } from './domain/search';
import type { CityShapes, CitySummary } from './domain/types';
import type { MapRenderer, MapViewEvents, RenderSlot } from './map/mapView';
import type { CityDataSource } from './services/cityRepository';
import type { PreferencesService } from './services/preferences';
import { decodeState, encodeState } from './services/shareLink';
import type { WeatherService } from './services/weatherService';
import * as actions from './state/appState';
import { SLOTS, type AppState, type Slot } from './state/appState';
import { chooseInitialCities } from './state/initialSelection';
import { Store } from './state/store';
import { CityInfoPanel } from './ui/cityInfoPanel';
import { CityPicker } from './ui/cityPicker';
import { ComparisonPanel, type AreaFigures } from './ui/comparisonPanel';
import { ControlsPanel } from './ui/controlsPanel';
import { h } from './ui/dom';
import { Toast } from './ui/toast';

export interface AppElements {
  readonly map: HTMLElement;
  readonly pickerA: HTMLElement;
  readonly pickerB: HTMLElement;
  readonly controls: HTMLElement;
  readonly comparison: HTMLElement;
  readonly info: HTMLElement;
  readonly legend: HTMLElement;
  readonly toast: HTMLElement;
}

export interface AppDependencies {
  readonly config: AppConfig;
  readonly repository: CityDataSource;
  readonly weather: WeatherService;
  readonly preferences: PreferencesService;
  readonly createMap: (container: HTMLElement, events: MapViewEvents) => MapRenderer;
  readonly random?: () => number;
}

const FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
const URL_SYNC_DELAY_MS = 400;
const CLOCK_INTERVAL_MS = 30_000;

/** Composition root and controller: owns the store and keeps map, panels, URL and storage in sync. */
export class App {
  private readonly shapes = new Map<string, CityShapes>();
  private cities = new Map<string, CitySummary>();
  private store!: Store<AppState>;
  private map!: MapRenderer;
  private pickers!: Record<Slot, CityPicker>;
  private controls!: ControlsPanel;
  private comparison!: ComparisonPanel;
  private info!: CityInfoPanel;
  private toast!: Toast;
  private urlTimer = 0;

  constructor(
    private readonly deps: AppDependencies,
    private readonly els: AppElements,
  ) {}

  async start(): Promise<void> {
    const list = await this.deps.repository.loadIndex();
    this.cities = new Map(list.map((c) => [c.id, c]));
    this.store = new Store(this.initialState(list));

    const index = new CitySearchIndex(list);
    this.toast = new Toast(this.els.toast);
    this.pickers = {
      a: new CityPicker(this.els.pickerA, 'a', 'Base city', index, (c) => this.dispatch((s) => actions.selectCity(s, 'a', c))),
      b: new CityPicker(this.els.pickerB, 'b', 'Overlay city', index, (c) => this.dispatch((s) => actions.selectCity(s, 'b', c))),
    };
    this.map = this.deps.createMap(this.els.map, {
      onPick: (slot) => this.dispatch((s) => actions.setActive(s, slot)),
      onMove: (slot, centre) => this.dispatch((s) => actions.moveCity(s, slot, centre)),
      onMoveEnd: () => undefined,
    });
    this.controls = new ControlsPanel(this.els.controls, {
      onShowMetro: (show) => this.dispatch((s) => actions.setShowMetro(s, show)),
      onActive: (slot) => this.dispatch((s) => actions.setActive(s, slot)),
      onRotation: (deg) => this.dispatch((s) => actions.setRotation(s, s.active, deg)),
      onOpacity: (value) => this.dispatch((s) => actions.setOpacity(s, s.active, value)),
      onSwap: () => {
        this.dispatch((s) => actions.swap(s, this.lookup));
        this.map.fitToCities(FIT_PADDING);
      },
      onReset: () => {
        this.dispatch((s) => actions.reset(s, this.lookup));
        this.map.fitToCities(FIT_PADDING);
      },
      onShare: () => void this.share(),
    });
    this.comparison = new ComparisonPanel(this.els.comparison);
    this.info = new CityInfoPanel(this.els.info);

    this.store.subscribe((state, previous) => this.onChange(state, previous));
    this.onChange(this.store.get(), null);
    window.setInterval(() => this.info.tick(), CLOCK_INTERVAL_MS);
  }

  private readonly lookup = (id: string): CitySummary | undefined => this.cities.get(id);

  private dispatch(update: (state: AppState) => AppState): void {
    this.store.update(update);
  }

  /** Share link first, then this device's last cities, then a random top-20 pair. */
  private initialState(list: readonly CitySummary[]): AppState {
    const shared = decodeState(window.location.search, (id) => this.cities.has(id), actions.DEFAULT_OPACITY);
    if (shared) {
      const [a, b] = shared.cityIds.map((id) => this.cities.get(id)!) as [CitySummary, CitySummary];
      let state = actions.createState(a, b, shared.showMetro);
      for (const slot of SLOTS) {
        const s = shared.slots[slot];
        if (s) state = { ...state, slots: { ...state.slots, [slot]: { ...state.slots[slot], ...s } } };
      }
      return state;
    }
    const [a, b] = chooseInitialCities(list, this.deps.preferences.loadLastCities(), this.deps.random);
    return actions.createState(a, b);
  }

  private onChange(state: AppState, previous: AppState | null): void {
    const changedSlots = SLOTS.filter((slot) => !previous || previous.slots[slot].cityId !== state.slots[slot].cityId);
    if (changedSlots.length) this.onCitiesChanged(state, changedSlots);

    this.renderMap(state);
    this.renderPanels(state);
    // City changes re-fit once their outlines have loaded (see onCitiesChanged).
    if (previous && changedSlots.length === 0 && previous.showMetro !== state.showMetro) this.map.fitToCities(FIT_PADDING);
    this.scheduleUrlSync(state);
  }

  private onCitiesChanged(state: AppState, slots: readonly Slot[]): void {
    const { a, b } = state.slots;
    this.deps.preferences.saveLastCities(a.cityId, b.cityId);
    for (const slot of slots) {
      const city = this.cities.get(state.slots[slot].cityId);
      if (!city) continue;
      this.pickers[slot].setCity(city);
      this.info.setCity(slot, city);
      this.loadWeather(slot, city);
    }
    void this.loadShapes([a.cityId, b.cityId]).then(() => {
      const current = this.store.get();
      if (current.slots.a.cityId !== a.cityId || current.slots.b.cityId !== b.cityId) return; // superseded
      this.renderMap(current);
      this.renderPanels(current);
      this.map.fitToCities(FIT_PADDING);
    });
  }

  private async loadShapes(ids: readonly string[]): Promise<void> {
    await Promise.all(
      ids
        .filter((id) => !this.shapes.has(id))
        .map(async (id) => {
          const city = this.cities.get(id);
          if (!city) return;
          try {
            const boundaries = await this.deps.repository.loadBoundaries(id);
            this.shapes.set(id, buildShapes(boundaries, actions.anchorOf(city)));
          } catch (error) {
            console.error(error);
            this.toast.show(`Couldn't load the outline of ${city.name}. Please try again.`);
          }
        }),
    );
  }

  private loadWeather(slot: Slot, city: CitySummary): void {
    this.info.setWeather(slot, city.id, { status: 'loading' });
    this.deps.weather
      .getCurrent(city.lat, city.lon)
      .then((value) => this.info.setWeather(slot, city.id, { status: 'ready', value }))
      .catch(() => this.info.setWeather(slot, city.id, { status: 'error' }));
  }

  private renderMap(state: AppState): void {
    const slots: Partial<Record<Slot, RenderSlot>> = {};
    for (const slot of SLOTS) {
      const s = state.slots[slot];
      const shapes = this.shapes.get(s.cityId);
      if (shapes) slots[slot] = { shapes, centre: s.centre, rotation: s.rotation, opacity: s.opacity };
    }
    this.map.render({ slots, active: state.active, showMetro: state.showMetro });
  }

  private renderPanels(state: AppState): void {
    const name = (slot: Slot): string => this.cities.get(state.slots[slot].cityId)?.name ?? '';
    const names = { a: name('a'), b: name('b') };
    const figures: Partial<Record<Slot, AreaFigures>> = {};
    for (const slot of SLOTS) {
      const shapes = this.shapes.get(state.slots[slot].cityId);
      if (shapes) figures[slot] = { name: names[slot], cityAreaM2: shapes.cityAreaM2, metroAreaM2: shapes.metroAreaM2 };
    }
    this.controls.update({ state, names, metroAvailable: SLOTS.some((slot) => this.shapes.get(state.slots[slot].cityId)?.metro) });
    this.comparison.update(figures, state.showMetro);
    this.els.legend.replaceChildren(
      ...SLOTS.map((slot) => h('span', { class: `legend-item slot-${slot}` }, [h('span', { class: 'swatch', attrs: { 'aria-hidden': 'true' } }), names[slot]])),
    );
  }

  private shareUrl(state: AppState): string {
    return `${window.location.origin}${window.location.pathname}?${encodeState(state)}`;
  }

  /** Keeps the address bar in sync (debounced), so reloading or copying the URL restores the view. */
  private scheduleUrlSync(state: AppState): void {
    window.clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => window.history.replaceState(null, '', this.shareUrl(state)), URL_SYNC_DELAY_MS);
  }

  private async share(): Promise<void> {
    const state = this.store.get();
    const url = this.shareUrl(state);
    const title = `${this.cities.get(state.slots.b.cityId)?.name} vs ${this.cities.get(state.slots.a.cityId)?.name} – Overlap Cities`;
    const touch = window.matchMedia('(pointer: coarse)').matches;
    try {
      if (touch && typeof navigator.share === 'function') {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      this.toast.show('Link copied to clipboard');
    } catch (error) {
      if ((error as Error).name === 'AbortError') return; // user closed the share sheet
      window.history.replaceState(null, '', url);
      this.toast.show('Copy the link from the address bar');
    }
  }
}
