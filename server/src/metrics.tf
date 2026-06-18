import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const register = new Registry();

// Count total HTTP requests
export const httpRequestsTotal = new Counter({
  name: 'clashvers_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
});
:wq

// Track active coding battles
export const activeBattles = new Gauge({
  name: 'clashvers_active_battles',
  help: 'Number of active 1v1 coding battles',
  registers: [register],
});

// Track request duration
export const httpDuration = new Histogram({
  name: 'clashvers_http_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route'],
  registers: [register],
});
