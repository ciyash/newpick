import { Worker } from "bullmq";
import bullRedis from "../config/bullRedis.js";
import { generateTeamsService } from  "../modules/services/newgenerateteam.service.js";
import logger from "../utils/logger.js";

const worker = new Worker(
  "team-generation",
  async job => {
    const { userId } = job.data;

    logger.info(`Processing job ${job.id}`);

    try {
      const result = await generateTeamsService(userId, job.data);
      logger.info(` Job ${job.id} completed`);
      return result;
    } catch (err) {
      logger.error(` Job ${job.id} failed:`, err.message);
      throw err;
    }
  },
  {
    concurrency: 5,
    connection: bullRedis
  }
);

worker.on("completed", job => {
  logger.info(` Completed job ${job.id}`);
});

worker.on("failed", (job, err) => {
  logger.error(` Failed job ${job.id}:`, err.message);
});