import { flagEmoji, formatLocalTime, formatPopulation, formatTemperature, MONTHS } from '../domain/format';
import type { CitySummary, Climate } from '../domain/types';
import { describeWeather } from '../domain/weatherCodes';
import type { CurrentWeather } from '../services/weatherService';
import type { Slot } from '../state/appState';
import { h } from './dom';

export type WeatherState = { readonly status: 'loading' } | { readonly status: 'error' } | { readonly status: 'ready'; readonly value: CurrentWeather };

interface Card {
  readonly root: HTMLElement;
  city: CitySummary | null;
  time: HTMLElement | null;
  weather: readonly [HTMLElement, HTMLElement] | null;
}

/**
 * "City facts" cards: country, region, population, time zone, weather, climate and the city-limits definition.
 * Optional extras fail quietly: if live weather is unavailable its row is removed, and cities
 * without climate data simply have no chart – no error messages for the user.
 */
export class CityInfoPanel {
  private readonly cards: Record<Slot, Card>;

  constructor(container: HTMLElement) {
    const card = (slot: Slot): Card => ({ root: h('article', { class: `info-card slot-${slot}` }), city: null, time: null, weather: null });
    this.cards = { a: card('a'), b: card('b') };
    container.append(h('h2', { class: 'section-title', text: 'City facts' }), h('div', { class: 'info-grid' }, [this.cards.a.root, this.cards.b.root]));
  }

  setCity(slot: Slot, city: CitySummary): void {
    const card = this.cards[slot];
    if (card.city?.id === city.id) return;
    card.city = city;
    card.time = h('dd', { text: formatLocalTime(city.timezone) });
    card.weather = [h('dt', { text: 'Weather now' }), h('dd', { text: 'Loading…' })];

    const row = (label: string, value: string): HTMLElement[] => [h('dt', { text: label }), h('dd', { text: value })];
    card.root.replaceChildren(
      h('h3', { class: 'info-title', text: city.name }),
      h('dl', { class: 'facts' }, [
        ...row('Country', `${flagEmoji(city.countryCode)} ${city.country}`),
        ...row('Region', city.region),
        ...row('Population', formatPopulation(city.population)),
        ...(city.metroPopulation ? row('Metro population', formatPopulation(city.metroPopulation)) : []),
        ...row('Time zone', city.timezone.replace(/_/g, ' ')),
        h('dt', { text: 'Local time' }),
        card.time,
        ...card.weather,
        ...(city.boundaryNote ? row('City limits', city.boundaryNote) : []),
      ]),
    );
    if (city.climate) card.root.append(climateChart(city.climate));
  }

  setWeather(slot: Slot, cityId: string, state: WeatherState): void {
    const card = this.cards[slot];
    if (card.city?.id !== cityId || !card.weather) return;
    const [label, value] = card.weather;
    if (state.status === 'error') {
      label.remove();
      value.remove();
      return;
    }
    value.textContent =
      state.status === 'loading'
        ? 'Loading…'
        : `${formatTemperature(state.value.temperatureC)}, ${describeWeather(state.value.code).toLowerCase()} · wind ${Math.round(state.value.windKmh)} km/h`;
  }

  /** Refreshes the local clocks. */
  tick(now = new Date()): void {
    for (const card of Object.values(this.cards)) {
      if (card.city && card.time) card.time.textContent = formatLocalTime(card.city.timezone, now);
    }
  }
}

function climateChart(climate: Climate): HTMLElement {
  const month = new Date().getMonth();
  const lo = Math.min(...climate.tmin);
  const hi = Math.max(...climate.tmax);
  const span = Math.max(hi - lo, 1);
  const bars = climate.tmax.map((max, i) => {
    const min = climate.tmin[i] ?? max;
    const bar = h('span', { class: `bar${i === month ? ' is-current' : ''}`, attrs: { title: `${MONTHS[i]}: ${formatTemperature(min)} – ${formatTemperature(max)}` } });
    // CSSOM writes are allowed under a strict CSP (unlike inline style attributes).
    bar.style.bottom = `${((min - lo) / span) * 100}%`;
    bar.style.height = `${Math.max(((max - min) / span) * 100, 4)}%`;
    return h('div', { class: 'bar-slot' }, [bar, h('span', { class: 'bar-label', text: MONTHS[i]?.charAt(0) ?? '' })]);
  });
  const now = `Typical ${MONTHS[month]}: ${formatTemperature(climate.tmax[month] ?? 0)} / ${formatTemperature(climate.tmin[month] ?? 0)}`;
  return h('figure', { class: 'climate' }, [
    h('figcaption', { text: now }),
    h('div', { class: 'bars', attrs: { role: 'img', 'aria-label': `Average monthly temperature range. ${now}.` } }, bars),
  ]);
}
