import crypto from "crypto";

const generateUserCode = () => {
  return "PW" + crypto.randomBytes(4).toString("hex").toUpperCase();
};

export default generateUserCode;