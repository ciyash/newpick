import express from 'express';

import { manualPlayerPointsService, manualPlayingXIService } from './test.service.js';

const router = express.Router();

// POST /api/admin/matches/playing-xi/manual
router.post("/matches/playing-xi/manual", async (req, res) => {
  try {
    const { match_id, players } = req.body;

    if (!match_id || !Array.isArray(players) || !players.length) {
      return res.status(400).json({ 
        success: false, 
        message: "match_id and players[] required" 
      });
    }

    const result = await manualPlayingXIService(String(match_id), players);
    res.json(result);
  } catch (err) {
    console.error("Manual XI error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/admin/matches/points/sync

router.post("/matches/points/manual", async (req, res) => {
  try {
    const { match_id, players } = req.body;
    if (!match_id || !Array.isArray(players) || !players.length) {
      return res.status(400).json({ success: false, message: "match_id and players[] required" });
    }
    const result = await manualPlayerPointsService(String(match_id), players);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;