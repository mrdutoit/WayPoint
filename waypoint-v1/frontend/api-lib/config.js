import 'dotenv/config';

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

const optional = (key, fallback) => process.env[key] ?? fallback;

export const config = {
  logLevel: optional('LOG_LEVEL', 'info'),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: optional('JWT_EXPIRES_IN', '8h'),
  // Feature flags — see FR-002/FR-029/FR-028 in the Stage 2 Architecture
  // and Design document for what each controls.
  awsKmsKeyId: optional('AWS_KMS_KEY_ID', null), // only required once security.fieldEncryption.enabled is turned on for a tenant
  bootstrapSecret: optional('BOOTSTRAP_SECRET', null),
  platformAdminEmail: optional('PLATFORM_ADMIN_EMAIL', null),
  platformAdminPassword: optional('PLATFORM_ADMIN_PASSWORD', null),
  platformAdminFirstName: optional('PLATFORM_ADMIN_FIRST_NAME', 'Platform'),
  platformAdminLastName: optional('PLATFORM_ADMIN_LAST_NAME', 'Administrator'),
};
