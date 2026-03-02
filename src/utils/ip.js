export const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || 
    req.socket?.remoteAddress ||
    null
  );
}