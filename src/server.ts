import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors"; // 👈 import cors
import userRoutes from "./routes/users";
import brandRoutes from "./routes/brands";
import "./cron/job"; // start cron jobs
import { startCronJobs } from "./cron/job";
import ordersRoutes from "./routes/orders";

const app = express();
const PORT = process.env.PORT || 4000;

// ✅ Enable CORS for any site
app.use(cors({ origin: "*" }));

// ✅ Parse JSON
app.use(express.json());

// Routes
app.use("/users", userRoutes);
app.use("/brand", brandRoutes);
app.use("/order", ordersRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  startCronJobs();
});
