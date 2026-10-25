import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/main.css';
import { App } from './app';
import { loadConfig } from './config';
import { MapView } from './map/mapView';
import { StaticCityRepository } from './services/cityRepository';
import { browserStorage, PreferencesService } from './services/preferences';
import { WeatherService } from './services/weatherService';
import { byId } from './ui/dom';

const config = loadConfig(import.meta.env);
const fetchFn = window.fetch.bind(window);

const app = new App(
  {
    config,
    repository: new StaticCityRepository(config.dataBaseUrl, fetchFn),
    weather: new WeatherService(fetchFn, config.weatherApiUrl),
    preferences: new PreferencesService(browserStorage()),
    createMap: (container, events) => new MapView(container, events),
  },
  {
    map: byId('map'),
    pickerA: byId('picker-a'),
    pickerB: byId('picker-b'),
    controls: byId('controls'),
    comparison: byId('comparison'),
    info: byId('city-info'),
    legend: byId('legend'),
    toast: byId('toast'),
  },
);

setUpChrome();
app.start().catch((error: unknown) => {
  console.error(error);
  const status = byId('status');
  status.textContent = 'Sorry, the city data could not be loaded. Please refresh the page.';
  status.hidden = false;
});

/** Page furniture that is independent of the comparison state. */
function setUpChrome(): void {
  const panel = byId('panel');
  const toggle = byId<HTMLButtonElement>('sheet-toggle');
  toggle.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('is-collapsed');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = collapsed ? 'More' : 'Less';
  });

  const about = byId<HTMLDialogElement>('about');
  byId('about-open').addEventListener('click', () => about.showModal());
  byId('about-close').addEventListener('click', () => about.close());
}
