export interface ForecastProjectReference {
  readonly id: string;
  readonly name: string;
}

export interface ForecastProjectReader {
  findById(projectId: string): Promise<ForecastProjectReference | null>;
}

export const FORECAST_PROJECT_READER = Symbol('ForecastProjectReader');
