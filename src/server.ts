import dotenv from "dotenv";
dotenv.config();
import express from "express";
import "./cron/job"; // start cron jobs
import { startCronJobs } from "./cron/job";
const app = express();
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  
  startCronJobs();
  
 
});
