export interface ForecastClientReference {
  readonly id: string;
  readonly companyName: string;
}

export interface ForecastClientReader {
  findById(clientId: string): Promise<ForecastClientReference | null>;
}

export const FORECAST_CLIENT_READER = Symbol('ForecastClientReader');
