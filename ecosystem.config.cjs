const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const port = String(process.env.PORT || "3003").trim();

/** Shared runtime env for PM2 apps (dotenv already loaded above). */
const sharedEnv = {
  NODE_ENV: "production",
  PORT: port,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  DATABASE_SSL: process.env.DATABASE_SSL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ZATCA_SUPPORT_WHATSAPP: process.env.NEXT_PUBLIC_ZATCA_SUPPORT_WHATSAPP,
  UPLOADS_DIR: process.env.UPLOADS_DIR,
  TRANSLATION_API_KEY: process.env.TRANSLATION_API_KEY,
  GEMINI_TRANSLATION_MODEL: process.env.GEMINI_TRANSLATION_MODEL,
  ZATCA_ENABLED: process.env.ZATCA_ENABLED,
  ZATCA_ENV: process.env.ZATCA_ENV,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL,
  SMTP_FROM_NAME: process.env.SMTP_FROM_NAME,
  HISABI_DEV_AUTOVERIFY_LOGIN: process.env.HISABI_DEV_AUTOVERIFY_LOGIN,
  HISABI_DEV_AUTOVERIFY_OTP: process.env.HISABI_DEV_AUTOVERIFY_OTP,
  PRINT_BRIDGE_URL: process.env.PRINT_BRIDGE_URL,
  PRINT_BRIDGE_PORT: process.env.PRINT_BRIDGE_PORT,
  PRINT_BRIDGE_SECRET: process.env.PRINT_BRIDGE_SECRET,
  PRINT_BRIDGE_DRY_RUN: process.env.PRINT_BRIDGE_DRY_RUN,
  PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH,
};

module.exports = {
  apps: [
    {
      name: "hisabi-pos-next-app",
      script: "node_modules/.bin/next",
      args: `start -p ${port}`,
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      env: sharedEnv,
    },
    {
      name: "hisabi-pos-zatca-worker",
      script: "scripts/zatca-background-worker.mjs",
      interpreter: "bun",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      env: {
        ...sharedEnv,
        ZATCA_WORKER_POLL_MS: process.env.ZATCA_WORKER_POLL_MS || "60000",
      },
    },
  ],
};
