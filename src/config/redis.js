import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 🔍 Test Redis connection
(async () => {
  try {
    const result = await redis.ping();
    console.log("✅ Redis connected successfully:", result);
  } catch (error) {
    console.error("❌ Redis connection failed:", error.message);
  }
})();

export default redis;
