import { Queue } from "bullmq";
import bullRedis from "../config/bullRedis.js";

export const teamQueue = new Queue("team-generation", {
  connection: bullRedis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});