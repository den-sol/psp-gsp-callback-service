import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppLogger } from './common/app-logger.service';
import { correlationIdMiddleware } from './common/correlation-id.middleware';

async function bootstrap() {
  // bufferLogs so early framework logs are replayed through our structured
  // logger once it's installed below.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(AppLogger));
  app.use(correlationIdMiddleware);

  // Reject unknown fields and coerce payloads to DTO types. Validation
  // failures surface as 400s formatted by the global exception filter.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PSP/GSP Callback Service')
    .setDescription(
      'Identity (opaque session tokens) + PSP/GSP callback ingestion. ' +
        'Callbacks are persisted to a raw_events outbox and deduplicated; ' +
        'balances are never mutated here.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
