import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const log = new Logger('Bootstrap');

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ---- CORS ----
  // CORS_ORIGIN is a comma-separated list. Each entry must be the exact origin
  // (scheme + host + port) — no path, no trailing slash. Whitespace is trimmed.
  // Example: "http://localhost:5173,https://aval.mbokofit.com"
  const rawOrigins = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  const allowed = rawOrigins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowAll = process.env.CORS_ALLOW_ALL === 'true';

  log.log(
    allowAll
      ? 'CORS: allowing ALL origins (CORS_ALLOW_ALL=true) — disable in prod.'
      : `CORS: allowed origins = ${JSON.stringify(allowed)}`,
  );

  app.enableCors({
    origin: (origin, cb) => {
      // Same-origin / curl / server-to-server have no Origin header → allow.
      if (!origin) return cb(null, true);
      if (allowAll) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, origin);
      log.warn(`CORS: blocked request from origin "${origin}"`);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Admin-Token',
      'X-Requested-With',
    ],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400,
  });

  // Trust the platform's reverse proxy so req.ip + req.protocol reflect the
  // real client / scheme (needed for accurate IP logs and HTTPS detection).
  const expressApp = app.getHttpAdapter().getInstance() as {
    set?: (k: string, v: unknown) => void;
  };
  expressApp.set?.('trust proxy', 1);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  log.log(`Aval backend listening on port ${port} (prefix /api)`);
}
bootstrap();
