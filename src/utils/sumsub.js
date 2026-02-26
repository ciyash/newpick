import crypto from "crypto";

import https from "https";

export const createSumsubHeaders = (method, path, body = "") => {

  const ts = Math.floor(Date.now() / 1000).toString();

  const data = ts + method.toUpperCase() + path + body;

  const signature = crypto
    .createHmac("sha256", process.env.SUMSUB_SECRET_KEY)
    .update(data)
    .digest("hex");

  return {
    "X-App-Token": process.env.SUMSUB_APP_TOKEN,
    "X-App-Access-Ts": ts,
    "X-App-Access-Sig": signature
  };
};



export const sumsubPost = (url, headers, body = null) => {
  return new Promise((resolve, reject) => {

    const req = https.request(url, {
      method: "POST",
      headers
    }, res => {

      let data = "";

      res.on("data", chunk => data += chunk);

      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });

    });

    req.on("error", reject);

    if (body) req.write(body);

    req.end();
  });
};