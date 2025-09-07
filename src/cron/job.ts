import cron from "node-cron";
import axios from "axios";
import "dotenv/config";
import { saveOrUpdateToken } from "../services/tokenService"; // adjust path

export function startCronJobs() {
  cron.schedule(
    "0 0 * * *", // run once every 24h at midnight IST
    async () => {
      console.log("[cron] daily login job started at", new Date().toISOString());
console.log("client", process.env.CLIENTID)
      try {
        const response = await axios.post(
          "https://api.dev.myhubble.money/v1/partners/auth/login",
          {
            clientId: process.env.CLIENTID,
            clientSecret: process.env.CLIENTSECRET,
          }
        );

        const token = response.data?.accessToken || response.data?.token;
        if (token) {
          await saveOrUpdateToken(token);
        } else {
          console.warn("[cron] no token found in response");
        }
      } catch (err: any) {
        console.error(
          "[cron] login job failed",
          err.response?.data || err.message
        );
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );
}
