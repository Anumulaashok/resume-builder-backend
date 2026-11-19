import express from 'express';
import request from 'supertest';
import app from '../app';
import { User } from '../models/User';
import logger from '../utils/logger';
import {
  redact,
  createRequestLogger,
  MAX_BODY_LENGTH,
  REDACTED_VALUE,
} from '../middleware/requestLogger';

describe('requestLogger middleware and redact helper', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-key';
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  describe('redact()', () => {
    it('deep-copies the body without mutating the original object or nested structures', () => {
      const original = {
        name: 'Jane Doe',
        password: 'PlainTextPassword!123',
        nested: {
          apiKey: 'sk-live-12345',
          safeField: 'keep-me',
          items: [{ refreshToken: 'tok-abc', label: 'item-1' }],
        },
      };

      const redacted = redact(original) as any;

      expect(original.password).toBe('PlainTextPassword!123');
      expect(original.nested.apiKey).toBe('sk-live-12345');
      expect(original.nested.items[0].refreshToken).toBe('tok-abc');

      expect(redacted).not.toBe(original);
      expect(redacted.nested).not.toBe(original.nested);
      expect(redacted.nested.items).not.toBe(original.nested.items);
      expect(redacted.nested.items[0]).not.toBe(original.nested.items[0]);

      redacted.nested.safeField = 'mutated';
      expect(original.nested.safeField).toBe('keep-me');
    });

    it('redacts all keys matching /pass(word)?|token|secret|authorization|apikey/i', () => {
      const payload = {
        pass: 'p1',
        password: 'p2',
        currentPassword: 'p3',
        PASSWORD_CONFIRM: 'p4',
        token: 't1',
        accessToken: 't2',
        shareToken: 't3',
        secret: 's1',
        clientSecret: 's2',
        authorization: 'Bearer xyz',
        Authorization: 'Bearer abc',
        apikey: 'k1',
        apiKey: 'k2',
        LLAMA_APIKEY: 'k3',
        title: 'Senior Engineer',
        email: 'jane@example.com',
      };

      const result = redact(payload) as Record<string, unknown>;

      expect(result).toEqual({
        pass: REDACTED_VALUE,
        password: REDACTED_VALUE,
        currentPassword: REDACTED_VALUE,
        PASSWORD_CONFIRM: REDACTED_VALUE,
        token: REDACTED_VALUE,
        accessToken: REDACTED_VALUE,
        shareToken: REDACTED_VALUE,
        secret: REDACTED_VALUE,
        clientSecret: REDACTED_VALUE,
        authorization: REDACTED_VALUE,
        Authorization: REDACTED_VALUE,
        apikey: REDACTED_VALUE,
        apiKey: REDACTED_VALUE,
        LLAMA_APIKEY: REDACTED_VALUE,
        title: 'Senior Engineer',
        email: 'jane@example.com',
      });
    });

    it('handles primitives, null, undefined, arrays, Dates, shared refs, and circular refs safely', () => {
      expect(redact(null)).toBeNull();
      expect(redact(undefined)).toBeUndefined();
      expect(redact('hello')).toBe('hello');
      expect(redact(42)).toBe(42);
      expect(redact(true)).toBe(true);

      const date = new Date('2026-01-01T00:00:00.000Z');
      const copiedDate = redact(date) as Date;
      expect(copiedDate).toEqual(date);
      expect(copiedDate).not.toBe(date);

      const shared = { label: 'ok', secretKey: 'shh' };
      const withShared = redact({ a: shared, b: shared }) as any;
      expect(withShared.a).toEqual({ label: 'ok', secretKey: REDACTED_VALUE });
      expect(withShared.b).toEqual({ label: 'ok', secretKey: REDACTED_VALUE });

      const circular: Record<string, unknown> = { name: 'cycle', token: 'tok' };
      circular.self = circular;
      const redactedCircular = redact(circular) as any;
      expect(redactedCircular.name).toBe('cycle');
      expect(redactedCircular.token).toBe(REDACTED_VALUE);
      expect(redactedCircular.self).toBe('[Circular]');
    });
  });

  describe('Supertest integration with Express app (/api/auth/*)', () => {
    it('never logs plaintext password or request body on POST /api/auth/register while keeping method/path/status/duration', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const winstonInfoSpy = jest.spyOn(logger, 'info').mockImplementation((() => logger) as any);
      const winstonErrorSpy = jest.spyOn(logger, 'error').mockImplementation((() => logger) as any);

      const plainPassword = 'MyUltraSecretRegisterPassword!2026';
      const email = 'newuser@example.com';

      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      const createSpy = jest.spyOn(User, 'create').mockImplementation(async (data: any) => ({
        _id: '507f1f77bcf86cd799439011',
        name: data.name,
        email: data.email,
      } as any));

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'New User',
          email,
          password: plainPassword,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      // Downstream signup handler still received the unmutated password
      expect(createSpy).toHaveBeenCalledWith({
        name: 'New User',
        email,
        password: plainPassword,
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const loggedLine = consoleLogSpy.mock.calls[0].join(' ');
      expect(loggedLine).toMatch(
        /^\[\d{4}-\d{2}-\d{2}T[^\]]+\] POST \/api\/auth\/register 201 \d+ms$/
      );
      expect(loggedLine).not.toContain('Body:');

      const allLoggedOutput = [
        ...consoleLogSpy.mock.calls.flat(),
        ...consoleErrorSpy.mock.calls.flat(),
        ...winstonInfoSpy.mock.calls.flat(),
        ...winstonErrorSpy.mock.calls.flat(),
      ]
        .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
        .join('\n');

      expect(allLoggedOutput).not.toContain(plainPassword);
      expect(allLoggedOutput).not.toContain(email);
    });

    it('never logs plaintext password or body on POST /api/auth/login or failed auth requests (including query strings and uppercase paths)', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const loginPassword = 'LoginSecretPass#98765';
      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      await request(app)
        .post('/API/AUTH/login?redirect=/dashboard')
        .send({
          email: 'loginuser@example.com',
          password: loginPassword,
        })
        .expect(401);

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const loggedLine = consoleLogSpy.mock.calls[0].join(' ');
      expect(loggedLine).toMatch(/POST \/API\/AUTH\/login\?redirect=\/dashboard 401 \d+ms$/);
      expect(loggedLine).not.toContain('Body:');
      expect(loggedLine).not.toContain(loginPassword);
      expect(loggedLine).not.toContain('loginuser@example.com');
    });
  });

  describe('createRequestLogger() with mock logger on non-auth routes', () => {
    it('redacts sensitive keys on non-auth POST routes without mutating req.body', async () => {
      const mockLogger = jest.fn();
      const testApp = express();
      testApp.use(express.json());
      testApp.use(createRequestLogger(mockLogger));

      let receivedBody: any;
      testApp.post('/api/resumes', (req, res) => {
        receivedBody = req.body;
        res.status(201).json({ ok: true });
      });

      await request(testApp)
        .post('/api/resumes')
        .send({
          title: 'Platform Resume',
          sharing: { shareToken: 'raw-share-token-xyz' },
          credentials: {
            password: 'raw-password-123',
            apiKey: 'raw-api-key-456',
            authorization: 'Bearer secret-jwt',
            clientSecret: 'raw-secret-789',
          },
        })
        .expect(201);

      // Handler received untouched values
      expect(receivedBody.sharing.shareToken).toBe('raw-share-token-xyz');
      expect(receivedBody.credentials.password).toBe('raw-password-123');

      expect(mockLogger).toHaveBeenCalledTimes(1);
      const output = mockLogger.mock.calls[0][0] as string;

      expect(output).toMatch(/POST \/api\/resumes 201 \d+ms - Body: /);
      expect(output).toContain('"title":"Platform Resume"');
      expect(output).toContain(`"shareToken":"${REDACTED_VALUE}"`);
      expect(output).toContain(`"password":"${REDACTED_VALUE}"`);
      expect(output).toContain(`"apiKey":"${REDACTED_VALUE}"`);
      expect(output).toContain(`"authorization":"${REDACTED_VALUE}"`);
      expect(output).toContain(`"clientSecret":"${REDACTED_VALUE}"`);

      expect(output).not.toContain('raw-share-token-xyz');
      expect(output).not.toContain('raw-password-123');
      expect(output).not.toContain('raw-api-key-456');
      expect(output).not.toContain('secret-jwt');
      expect(output).not.toContain('raw-secret-789');
    });

    it('never logs body for /api/auth/* routes when using mock logger', async () => {
      const mockLogger = jest.fn();
      const testApp = express();
      testApp.use(express.json());
      testApp.use(createRequestLogger(mockLogger));
      testApp.post('/api/auth/register', (_req, res) => {
        res.status(201).json({ success: true });
      });

      const registerPassword = 'NeverLogThisPassword!42';
      await request(testApp)
        .post('/api/auth/register')
        .send({
          name: 'Bob',
          email: 'bob@example.com',
          password: registerPassword,
        })
        .expect(201);

      expect(mockLogger).toHaveBeenCalledTimes(1);
      const output = mockLogger.mock.calls[0][0] as string;
      expect(output).toMatch(/POST \/api\/auth\/register 201 \d+ms$/);
      expect(output).not.toContain('Body:');
      expect(output).not.toContain(registerPassword);
      expect(output).not.toContain('bob@example.com');
    });

    it('truncates logged bodies exceeding 1000 chars to exactly 1000 chars', async () => {
      const mockLogger = jest.fn();
      const testApp = express();
      testApp.use(express.json());
      testApp.use(createRequestLogger(mockLogger));
      testApp.post('/api/resumes/r1/generate', (_req, res) => {
        res.status(200).json({ ok: true });
      });

      const longPrompt = `${'A'.repeat(1500)}END_MARKER_SHOULD_NOT_APPEAR`;
      await request(testApp)
        .post('/api/resumes/r1/generate')
        .send({ prompt: longPrompt, apiKey: 'secret-api-key-in-front' })
        .expect(200);

      expect(mockLogger).toHaveBeenCalledTimes(1);
      const output = mockLogger.mock.calls[0][0] as string;
      const marker = ' - Body: ';
      const idx = output.indexOf(marker);
      expect(idx).toBeGreaterThan(0);

      const loggedBody = output.slice(idx + marker.length);
      expect(loggedBody.length).toBe(MAX_BODY_LENGTH);
      expect(loggedBody.length).toBeLessThanOrEqual(1000);
      expect(loggedBody).not.toContain('END_MARKER_SHOULD_NOT_APPEAR');
      expect(loggedBody).not.toContain('secret-api-key-in-front');
    });

    it('omits request body on GET requests while keeping method/path/status/duration', async () => {
      const mockLogger = jest.fn();
      const testApp = express();
      testApp.use(express.json());
      testApp.use(createRequestLogger(mockLogger));
      testApp.get('/api/resumes', (_req, res) => {
        res.status(200).json([]);
      });

      await request(testApp).get('/api/resumes').expect(200);

      expect(mockLogger).toHaveBeenCalledTimes(1);
      const output = mockLogger.mock.calls[0][0] as string;
      expect(output).toMatch(/GET \/api\/resumes 200 \d+ms$/);
      expect(output).not.toContain('Body:');
    });
  });
});
