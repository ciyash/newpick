/**
 * PICK2WIN – Fantasy Football Scoring Engine
 * ES6 Module Version
 */

// ─────────────────────────────────────────────
// SCORING RULES (versioned & locked)
// ─────────────────────────────────────────────
export const RULES = {
  participation: {
    started: 4,
    subAppearance: 2,
    fullMatchContributionBonus: 2,
  },
  goals:          { FWD: 20, MID: 22, DEF: 24, GK: 24 },
  assists:        12,
  shotOnTarget:   4,
  keyPass:        2,
  penaltyEarned:  6,
  cleanSheet:     8,
  savesPerBonus:  3,
  savesBonus:     6,
  penaltySave:    16,
  tackleWon:      2,
  interception:   2,
  blockedShot:    2,
  goalsConcededPenalty: -1,
  yellowCard:     -4,
  redCard:        -10,
  ownGoal:        -12,
  penaltyMissed:  -12,
  severeMisconduct: -15,
  skillBonus:     { DEF: 3, MID: 3, FWD: 3, GK: 4 },
  highestScorer:  { starter: 4, substitute: 8 },
  captain:        2,
  viceCaptain:    1.5,
};

// ─────────────────────────────────────────────
// SINGLE PLAYER POINTS
// ─────────────────────────────────────────────
export const calculatePlayerPoints = (stats) => {
  const pos = stats.position;
  const breakdown = {};
  let points = 0;

  // STEP 1: Attacking
  const goalPts      = (stats.goals            || 0) * RULES.goals[pos];
  const assistPts    = (stats.assists           || 0) * RULES.assists;
  const shotPts      = (stats.shotsOnTarget     || 0) * RULES.shotOnTarget;
  const keyPassPts   = (stats.keyPasses         || 0) * RULES.keyPass;
  const penEarnedPts = (stats.penaltiesEarned   || 0) * RULES.penaltyEarned;

  Object.assign(breakdown, { goals: goalPts, assists: assistPts, shotsOnTarget: shotPts, keyPasses: keyPassPts, penaltiesEarned: penEarnedPts });
  points += goalPts + assistPts + shotPts + keyPassPts + penEarnedPts;

  const performancePoints = goalPts + assistPts + shotPts + keyPassPts + penEarnedPts;

  // STEP 2: Clean Sheet
  const hasCleanSheet =
    ["DEF", "GK"].includes(pos) &&
    (stats.minutesPlayed  || 0) >= 60 &&
    (stats.goalsConceded  || 0) === 0;

  breakdown.cleanSheet = hasCleanSheet ? RULES.cleanSheet : 0;
  points += breakdown.cleanSheet;

  // STEP 3: Goals Conceded
  breakdown.goalsConceded = ["DEF", "GK"].includes(pos)
    ? Math.floor((stats.goalsConceded || 0) / 2) * RULES.goalsConcededPenalty
    : 0;
  points += breakdown.goalsConceded;

  // STEP 4: Participation
  breakdown.started       = stats.started       ? RULES.participation.started       : 0;
  breakdown.subAppearance = stats.subAppearance  ? RULES.participation.subAppearance : 0;
  breakdown.fullMatchBonus =
    stats.playedFullMatch && performancePoints >= 2
      ? RULES.participation.fullMatchContributionBonus
      : 0;

  points += breakdown.started + breakdown.subAppearance + breakdown.fullMatchBonus;

  // Defensive actions
  breakdown.tacklesWon   = (stats.tacklesWon    || 0) * RULES.tackleWon;
  breakdown.interceptions = (stats.interceptions || 0) * RULES.interception;
  breakdown.blockedShots  = ["DEF", "GK"].includes(pos)
    ? (stats.blockedShots || 0) * RULES.blockedShot
    : 0;

  points += breakdown.tacklesWon + breakdown.interceptions + breakdown.blockedShots;

  // GK Saves
  if (pos === "GK") {
    breakdown.saves        = Math.floor((stats.saves        || 0) / RULES.savesPerBonus) * RULES.savesBonus;
    breakdown.penaltySaves = (stats.penaltySaves || 0) * RULES.penaltySave;
    points += breakdown.saves + breakdown.penaltySaves;
  }

  // STEP 5: Discipline
  breakdown.yellowCards     = (stats.yellowCards     || 0) * RULES.yellowCard;
  breakdown.redCards        = (stats.redCards        || 0) * RULES.redCard;
  breakdown.ownGoals        = (stats.ownGoals        || 0) * RULES.ownGoal;
  breakdown.penaltiesMissed = (stats.penaltiesMissed || 0) * RULES.penaltyMissed;
  points += breakdown.yellowCards + breakdown.redCards + breakdown.ownGoals + breakdown.penaltiesMissed;

  // STEP 6: Severe Misconduct
  breakdown.severeMisconduct =
    (stats.redCards || 0) > 0 && ((stats.ownGoals || 0) > 0 || (stats.penaltiesMissed || 0) > 0)
      ? RULES.severeMisconduct
      : 0;
  points += breakdown.severeMisconduct;

  // STEP 7: Skill Bonus
  let skillBonus = 0;
  if      (pos === "DEF" && ((stats.goals || 0) > 0 || (stats.assists || 0) > 0))                      skillBonus = RULES.skillBonus.DEF;
  else if (pos === "MID" && (stats.goals || 0) > 0 && (stats.assists || 0) > 0)                        skillBonus = RULES.skillBonus.MID;
  else if (pos === "FWD" && (stats.goals || 0) + (stats.assists || 0) >= 2)                            skillBonus = RULES.skillBonus.FWD;
  else if (pos === "GK"  && (stats.goalsConceded || 0) === 0 && (stats.saves || 0) >= 5)               skillBonus = RULES.skillBonus.GK;

  breakdown.skillBonus = skillBonus;
  points += skillBonus;

  return {
    playerId:    stats.playerId,
    breakdown,
    basePoints:  points,
  };
};

// ─────────────────────────────────────────────
// TEAM POINTS (Steps 8, 9, 10)
// ─────────────────────────────────────────────

export const calculateTeamPoints = (playerStatsList, captainId, viceCaptainId, allMatchMaxPoints = null) => {
  const playerResults = playerStatsList.map(calculatePlayerPoints);


  const starterMap = {};
  playerStatsList.forEach((s) => { starterMap[s.playerId] = s.started; });

  // STEP 8: Highest Scorer Bonus — match-level max use 
  const maxPoints = allMatchMaxPoints !== null
    ? allMatchMaxPoints                                     
    : Math.max(...playerResults.map((r) => r.basePoints));  

  playerResults.forEach((r) => {
    if (r.basePoints === maxPoints) {
      const bonus = starterMap[r.playerId]
        ? RULES.highestScorer.starter      // starter → +4
        : RULES.highestScorer.substitute;  // substitute → +8
      r.breakdown.highestScorerBonus = bonus;
      r.basePoints += bonus;
    } else {
      r.breakdown.highestScorerBonus = 0;
    }
  });

  // STEP 9: Captain / VC Multiplier
  playerResults.forEach((r) => {
    let multiplier = 1;
    if      (r.playerId === captainId)     multiplier = RULES.captain;
    else if (r.playerId === viceCaptainId) multiplier = RULES.viceCaptain;

    r.breakdown.multiplier = multiplier;
    r.finalPoints = Math.round(r.basePoints * multiplier * 100) / 100;
  });

  // STEP 10: Team Total
  const teamTotal = Math.round(
    playerResults.reduce((sum, r) => sum + r.finalPoints, 0) * 100
  ) / 100;

  return { players: playerResults, teamTotal };
};

// ─────────────────────────────────────────────
// RANKING ENGINE
// ─────────────────────────────────────────────
export const rankTeams = (teams) => {
  const sorted = [...teams].sort((a, b) => b.teamTotal - a.teamTotal);
  sorted.forEach((team, index) => {
    if (index === 0)                                             team.rank = 1;
    else if (team.teamTotal === sorted[index - 1].teamTotal)   team.rank = sorted[index - 1].rank;
    else                                                        team.rank = index + 1;
  });
  return sorted;
};

// ─────────────────────────────────────────────
// PRIZE DISTRIBUTION (Tie-aware)
// ─────────────────────────────────────────────
export const distributePrizes = (rankedTeams, prizePool) => {
  const rankGroups = {};
  rankedTeams.forEach((team) => {
    if (!rankGroups[team.rank]) rankGroups[team.rank] = [];
    rankGroups[team.rank].push(team);
  });

  rankedTeams.forEach((team) => {
    const group    = rankGroups[team.rank];
    const endRank  = team.rank + group.length - 1;
    let totalPrize = 0;
    for (let r = team.rank; r <= endRank; r++) totalPrize += prizePool[r] || 0;
    team.prizeWon  = Math.round((totalPrize / group.length) * 100) / 100;
  });

  return rankedTeams;
};