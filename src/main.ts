import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global API prefix and CORS for Tauri/localhost
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: true, // Allow all origins for local development
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Private-Network',
    ],
    credentials: true,
    optionsSuccessStatus: 204,
  });

  // Enable validation (hardened)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('PIMS API')
    .setDescription('Personal Information Management System API')
    .setVersion('1.0')
    .addTag('pims')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Expose Swagger at /docs to avoid clashing with global /api prefix
  SwaggerModule.setup('docs', app, document);

  // Add request logging middleware
  app.use((req, res, next) => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'unknown'}`,
    );
    next();
  });

  // Private Network Access (PNA) preflight support for Chromium-based webviews
  // Ensures requests from http://tauri.localhost to private IPs (e.g., 192.168.x.x) succeed
  app.use((req, res, next) => {
    // Always add private network headers for local development
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Access-Control-Allow-Origin, Access-Control-Allow-Private-Network',
    );

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(
    `Application is running on: http://0.0.0.0:${process.env.PORT ?? 3000}`,
  );
  console.log(
    `Swagger documentation: http://0.0.0.0:${process.env.PORT ?? 3000}/docs`,
  );
  console.log('CORS enabled for origins:', [
    /^http:\/\/localhost:\d+$/,
    'tauri://localhost',
    'tauri://localhost:3001',
    'http://localhost:3001',
    'http://tauri.localhost',
    /^tauri:\/\/.*$/,
    /^http:\/\/tauri\.localhost.*$/,
  ]);
}
bootstrap();
