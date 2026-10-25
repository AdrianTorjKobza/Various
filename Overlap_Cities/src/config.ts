export interface AppConfig {
  readonly dataBaseUrl: string;
  readonly weatherApiUrl: string;
}

export function loadConfig(env: { readonly BASE_URL: string }): AppConfig {
  const base = env.BASE_URL.endsWith('/') ? env.BASE_URL : `${env.BASE_URL}/`;
  return {
    dataBaseUrl: `${base}data/`,
    weatherApiUrl: 'https://api.open-meteo.com/v1/forecast',
  };
}
