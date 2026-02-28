
const HTTP = {
  BAD_REQUEST:   400,
  UNAUTHORIZED:  401,
  FORBIDDEN:     403,
  NOT_FOUND:     404,
  CONFLICT:      409,
  INTERNAL:      500,
};

const DB_ERRORS = {
  ER_DUP_ENTRY:         { status: HTTP.CONFLICT,    message: "Duplicate entry, record already exists" },
  ER_NO_REFERENCED_ROW: { status: HTTP.BAD_REQUEST, message: "Referenced record does not exist" },
  ER_ROW_IS_REFERENCED: { status: HTTP.CONFLICT,    message: "Record is in use and cannot be deleted" },
  ER_BAD_NULL_ERROR:    { status: HTTP.BAD_REQUEST, message: "Required field is missing" },
};

const MESSAGE_ERRORS = [
  { match: ["not found", "No deposits", "No withdraws", "No users", "No matches", "No contests", "No players", "No series"], status: HTTP.NOT_FOUND    },
  { match: ["already exists"],                                                                                                status: HTTP.CONFLICT     },
  { match: ["required", "Invalid", "invalid", "No data to update", "Minimum", "Maximum", "must be"],                        status: HTTP.BAD_REQUEST  },
  { match: ["unauthorized", "Unauthorized", "Token", "expired", "Session"],                                                  status: HTTP.UNAUTHORIZED },
  { match: ["Access denied", "not an admin", "not allowed"],                                                                 status: HTTP.FORBIDDEN    },
];

const resolveStatus = (err) => {

  if (err.status) return err.status;

  if (err.code && DB_ERRORS[err.code]) return DB_ERRORS[err.code].status;

  const msg = err.message || "";
  for (const { match, status } of MESSAGE_ERRORS) {
    if (match.some((keyword) => msg.toLowerCase().includes(keyword.toLowerCase()))) {
      return status;
    }
  }

  return HTTP.INTERNAL;
};



const resolveMessage = (err) => {

  
  if (err.code && DB_ERRORS[err.code]) return DB_ERRORS[err.code].message;

  return err.message || "Internal server error";
};


const errorHandler = (err, req, res, next) => {

  const status  = resolveStatus(err);
  const message = resolveMessage(err);

  if (status >= HTTP.INTERNAL) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} →`, err);
  }

  return res.status(status).json({ success: false, message });
};

export default errorHandler;