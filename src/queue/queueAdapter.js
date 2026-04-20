import { QUEUE_MODE } from "../config/queueMode.js";
import { teamQueue } from "./team.queue.js";
import { generateTeamsService } from "../modules/services/newgenerateteam.service.js";
import logger from "../utils/logger.js";

export const addGenerateTeamJob = async (data) => {

  //  DIRECT MODE (dev / upstash)
  if (QUEUE_MODE === "direct") {
    logger.warn("⚠️ Running in DIRECT mode");
    return await generateTeamsService(data.userId, data);
  }

  //  BULLMQ MODE (production)
  if (QUEUE_MODE === "bullmq") {
    try {
      await teamQueue.add("generate", data);
      return { queued: true };
    } catch (err) {
      logger.error("Queue failed, fallback to direct:", err.message);

      // fallback
      return await generateTeamsService(data.userId, data);
    }
  }

  throw new Error("Invalid QUEUE_MODE");
};