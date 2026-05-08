-- Performance indexes for high-scale contest creation and lookup paths.
-- These support match/category validation and duplicate-contest guards without
-- changing the existing table schema.

CREATE INDEX idx_match_id ON contest(match_id);
CREATE INDEX idx_match_contest_type ON contest(match_id, contest_type);
CREATE INDEX idx_contestcategory_name ON contestcategory(name);
CREATE INDEX idx_matches_id_status ON matches(id, status);
