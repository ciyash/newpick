import cron from "node-cron";
import { syncCompetitionsService } from "./entitysport.service.js";

cron.schedule("0 */6 * * *", async () => {

  console.log("Syncing competitions...");

  await syncCompetitionsService();

});