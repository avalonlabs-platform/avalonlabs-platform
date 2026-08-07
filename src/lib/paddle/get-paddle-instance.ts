import { Environment, LogLevel, Paddle, type PaddleOptions } from "@paddle/paddle-node-sdk";

export function getPaddleInstance(): Paddle {
  if (!process.env.PADDLE_API_KEY) {
    throw new Error("PADDLE_API_KEY is not set");
  }
  const options: PaddleOptions = {
    environment:
      process.env.NEXT_PUBLIC_PADDLE_ENV === "production"
        ? Environment.production
        : Environment.sandbox,
    logLevel: LogLevel.error,
  };
  return new Paddle(process.env.PADDLE_API_KEY, options);
}
