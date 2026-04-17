import {
  getAvailableSeriesService,
  toggleSeriesService,
  getActiveSeriesService,
  getAvailableMatchesService,
  getMatchesService,
  toggleMatchesService,
  syncPlayingXIService,
  syncPlayerPointsService,
  getAllFixturesBetween,
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

  
//=============================================================================/


export const getFixturesByDateRange = async (req, res) => {
  try {
    const { from, to } = req.body;

    /* ─── Validate ─── */
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: "from and to are required (YYYY-MM-DD)"
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(from) || !dateRegex.test(to)) {
      return res.status(400).json({
        success: false,
        message: "Date format must be YYYY-MM-DD"
      });
    }

    if (new Date(from) > new Date(to)) {
      return res.status(400).json({
        success: false,
        message: "'from' date must be before 'to' date"
      });
    }

    /* ─── Convert to IST Range ─── */
    const fromDate = new Date(from);
    fromDate.setHours(0, 0, 0, 0);

    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    /* ─── Fetch All Fixtures (API may return extra data) ─── */
    const fixtures = await getAllFixturesBetween(from, to);

    /* ─── FILTER (IMPORTANT – removes next day matches) ─── */
    const filteredFixtures = fixtures.filter(fixture => {
      if (!fixture.starting_at) return false;

      const fixtureDate = new Date(fixture.starting_at);
      return fixtureDate >= fromDate && fixtureDate <= toDate;
    });

    /* ─── Format Response ─── */
    const formatted = filteredFixtures.map(fixture => {

      const home = fixture.participants?.find(
        p => p.meta?.location === "home"
      );

      const away = fixture.participants?.find(
        p => p.meta?.location === "away"
      );

      return {
        id: fixture.id,
        name: fixture.name,
        date: fixture.starting_at,
        status: fixture.state?.name || "Unknown",

        league: {
          id: fixture.league?.id,
          name: fixture.league?.name,
          country: fixture.league?.country_id,
        },

        venue: {
          id: fixture.venue?.id,
          name: fixture.venue?.name,
          city: fixture.venue?.city_name,
        },

        home: {
          id: home?.id,
          name: home?.name,
          image: home?.image_path,
        },

        away: {
          id: away?.id,
          name: away?.name,
          image: away?.image_path,
        },

        score: {
          home:
            fixture.scores?.find(
              s =>
                s.description === "CURRENT" &&
                s.score?.participant === "home"
            )?.score?.goals ?? null,

          away:
            fixture.scores?.find(
              s =>
                s.description === "CURRENT" &&
                s.score?.participant === "away"
            )?.score?.goals ?? null,
        }
      };
    });

    return res.status(200).json({
      success: true,
      from,
      to,
      total: formatted.length,
      fixtures: formatted
    });

  } catch (err) {
    console.error("❌ Fixtures fetch error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};



 