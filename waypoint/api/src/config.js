import 'dotenv/config';

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const optional = (key, fallback) => process.env[key] ?? fallback;

export const config = {
  port: parseInt(optional('PORT', '3001'), 10),
  logLevel: optional('LOG_LEVEL', 'info'),
  // Fail loudly if these are missing in any real environment — a silently
  // wrong database or secret is far more expensive than a startup crash.
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '8h'),
  frontendOrigin: required('FRONTEND_ORIGIN'),
  // Feature flags — see FlagContext.jsx and FR-002/FR-029/FR-028 in the
  // Stage 2 Architecture and Design document for what each flag controls.
  awsKmsKeyId: optional('AWS_KMS_KEY_ID', null), // only required once security.fieldEncryption.enabled is turned on for a tenant
};
