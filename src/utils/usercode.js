import crypto from "crypto";

const generateUserCode = () => {
  return "P2W" + crypto.randomBytes(3).toString("hex").toUpperCase();
};

export default generateUserCode;