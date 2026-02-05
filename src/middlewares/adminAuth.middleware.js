import jwt from "jsonwebtoken";

export const adminAuth = (roles = []) => {
  return (req, res, next) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) throw new Error("Token missing");

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.type !== "admin")
        throw new Error("Unauthorized");

      if (roles.length && !roles.includes(decoded.role))
        throw new Error("Forbidden");

      req.admin = decoded;
      next();
    } catch (err) {
      res.status(401).json({
        success: false,
        message: err.message
      });
    }
  };
};
