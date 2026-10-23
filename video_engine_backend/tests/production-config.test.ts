import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionConfiguration, type ProductionConfiguration } from '../src/production-config-utils.js';

const base: ProductionConfiguration = {
  nodeEnv: 'production',
  jwtSecret: 'a'.repeat(64),
  frontendOrigin: 'https://mk-school.example',
  appBaseUrl: 'https://mk-school.example',
  host: '0.0.0.0',
  trustProxy: true,
  allowPrivateDatastoreTransport: true,
  databaseUrl: 'postgresql://school:password@postgres:5432/school',
  redisUrl: 'redis://redis:6379',
};

test('accepts a public HTTPS service behind a trusted proxy on a private Render network', () => {
  assert.deepEqual(validateProductionConfiguration(base), []);
});

test('rejects public all-interface binding without the trusted proxy setting', () => {
  const errors = validateProductionConfiguration({ ...base, trustProxy: false });
  assert.ok(errors.some(error => error.includes('trusted HTTPS proxy')));
});

test('requires encrypted remote datastores unless private Render transport is explicitly enabled', () => {
  const errors = validateProductionConfiguration({ ...base, allowPrivateDatastoreTransport: false });
  assert.ok(errors.some(error => error.includes('PostgreSQL')));
  assert.ok(errors.some(error => error.includes('Redis')));
});

test('accepts encrypted remote datastores behind a trusted proxy', () => {
  const secure = {
    ...base,
    allowPrivateDatastoreTransport: false,
    databaseUrl: 'postgresql://school:password@db.example:5432/school?sslmode=require',
    redisUrl: 'rediss://redis.example:6379',
  };
  assert.deepEqual(validateProductionConfiguration(secure), []);
});
