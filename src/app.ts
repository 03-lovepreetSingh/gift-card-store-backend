import express from "express";
import userRoutes from "./routes/users";

const app = express();

app.use(express.json());
app.use("/users", userRoutes);

app.get("/", (req, res) => {
  res.send("API is running 🚀");
});

export default app;
