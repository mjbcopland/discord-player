import * as winston from "winston";

const format = process.env.NODE_ENV === "production" ? winston.format.json() : winston.format.simple();
const transport = new winston.transports.Console({ format });

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "verbose",
  silent: Boolean(process.env.SILENT),
  transports: [transport],
});
