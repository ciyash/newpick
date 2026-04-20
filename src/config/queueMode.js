export const QUEUE_MODE = process.env.QUEUE_MODE || "direct";
// direct → no queue (dev / upstash)
// bullmq → queue (production)