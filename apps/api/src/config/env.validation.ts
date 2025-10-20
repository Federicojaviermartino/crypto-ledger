import * as Joi from 'joi';

/**
 * Environment variable validation schema
 */
export const envValidationSchema = Joi.object({
  // Node
  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),
  PORT: Joi.number().default(3000),

  // Database
  DATABASE_URL: Joi.string().required(),

  // JWT
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('7d'),

  // Redis
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow(''),

  // CORS
  CORS_ORIGIN: Joi.string().required(),

  // Blockchain
  ETH_RPC_URL: Joi.string().uri().required(),
  ETH_NETWORK: Joi.string().default('mainnet'),

  // Optional
  SENTRY_DSN: Joi.string().uri().allow(''),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'verbose').default('info'),
});
