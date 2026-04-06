import {
  getAvailableSeriesService,
  toggleSeriesService,
  getActiveSeriesService,
  getAvailableMatchesService,
  getMatchesService,
  toggleMatchesService,
  syncPlayingXIService,
  syncPlayerPointsService,
} from "./sportmonks.service.js";

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */
export const getAvailableSeries = async (req, res) => {
  try {
    const data = await getAvailableSeriesService();
    res.json({ success: true, data });
  } catch (err) {
    console.error("getAvailableSeries error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const toggleSeries = async (req, res) => {
  try {
    const { series_ids, is_active } = req.body;
    if (!series_ids || !Array.isArray(series_ids) || !series_ids.length)
      return res.status(400).json({ success: false, message: "series_ids array required" });
    if (is_active === undefined)
      return res.status(400).json({ success: false, message: "is_active required" });

    const data = await toggleSeriesService(series_ids, is_active);
    res.json({ success: true, data });
  } catch (err) {
    console.error("toggleSeries error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getActiveSeries = async (req, res) => {
  try {
    const result = await getActiveSeriesService();
    res.status(200).json(result);
  } catch (err) {
    console.error("getActiveSeries error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */
export const getAvailableMatches = async (req, res) => {
  try {
    const { seriesid } = req.params;
    if (!seriesid)
      return res.status(400).json({ success: false, message: "seriesid required" });

    const data = await getAvailableMatchesService(seriesid);
    res.json({ success: true, data });
  } catch (err) {
    console.error("getAvailableMatches error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const toggleMatches = async (req, res) => {
  try {
    const { match_ids, is_active } = req.body;  // series_id తీసేశాం
    if (!match_ids || !Array.isArray(match_ids) || !match_ids.length)
      return res.status(400).json({ success: false, message: "match_ids array required" });
    if (is_active === undefined)
      return res.status(400).json({ success: false, message: "is_active required" });

    const data = await toggleMatchesService(match_ids, is_active);  // series_id pass చేయట్లేదు
    res.json({ success: true, data });
  } catch (err) {
    console.error("toggleMatches error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};



// export const toggleMatches = async (req, res) => {
//   try {
//     const { match_ids, is_active, series_id } = req.body;
//     if (!match_ids || !Array.isArray(match_ids) || !match_ids.length)
//       return res.status(400).json({ success: false, message: "match_ids array required" });
//     if (is_active === undefined)
//       return res.status(400).json({ success: false, message: "is_active required" });

//     const data = await toggleMatchesService(match_ids, is_active, series_id);
//     res.json({ success: true, data });
//   } catch (err) {
//     console.error("toggleMatches error:", err.message);
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

export const getMatches = async (req, res) => {
  try {
    const { seriesid } = req.params;
    if (!seriesid)
      return res.status(400).json({ success: false, message: "seriesid required" });

    const result = await getMatchesService(seriesid);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ══════════════════════════════════════════
   SYNC
══════════════════════════════════════════ */
export const syncPlayingXI = async (req, res) => {
  try {
    const { match_id } = req.params;
    if (!match_id)
      return res.status(400).json({ success: false, message: "match_id required" });

    const result = await syncPlayingXIService(match_id);
    if (result.reason)
      return res.status(202).json({ success: false, message: result.reason, count: 0 });

    res.json({ success: true, message: `${result.count} playing XI synced`, count: result.count });
  } catch (err) {
    console.error("syncPlayingXI error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const syncPlayerPoints = async (req, res) => {
  try {
    const { match_id } = req.params;
    if (!match_id)
      return res.status(400).json({ success: false, message: "match_id required" });

    const result = await syncPlayerPointsService(match_id);
    if (result.reason)
      return res.status(202).json({ success: false, message: result.reason, count: 0 });

    res.json({ success: true, message: `${result.count} player points synced`, count: result.count });
  } catch (err) {
    console.error("syncPlayerPoints error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};  




  

