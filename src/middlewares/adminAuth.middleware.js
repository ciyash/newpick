import jwt from "jsonwebtoken";

const TOKEN_ERRORS = {
  TokenExpiredError:  "Session expired, please login again",
  JsonWebTokenError:  "Invalid token",
  NotBeforeError:     "Token not yet active",
};

export const adminAuth = (roles = []) => {
  return (req, res, next) => {
    try {

    
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, message: "Authorization header missing or malformed" });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).json({ success: false, message: "Token missing" });
      }

     
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (err) {
        const message = TOKEN_ERRORS[err.name] || "Token verification failed";
        return res.status(401).json({ success: false, message });
      }

    
      if (decoded.type !== "admin") {
        return res.status(403).json({ success: false, message: "Access denied: not an admin account" });
      }

    
      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ success: false, message: `Access denied: requires one of [${roles.join(", ")}] role` });
      }

    
      req.admin = decoded;
      next();

    } catch (err) {
      console.error("AdminAuth unexpected error:", err);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
};