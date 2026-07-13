export interface SystemInfoResponse {
  name: string;
  version: string;
  environment: string;
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  services: {
    database: { status: 'up' | 'down'; message?: string };
    redis: { status: 'up' | 'down'; message?: string };
  };
}
