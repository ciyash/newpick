import IORedis from "ioredis";

const bullRedis = new IORedis(
  process.env.REDIS_URL || {
    host: "127.0.0.1",
    port: 6379
  }
);

export default bullRedis;