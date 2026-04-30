const express = require("express");
const { registerGameRoutes } = require("./src/routes/gameRoutes");

const app = express();

app.use(express.urlencoded({ extended: true }));

registerGameRoutes(app);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Game running at http://localhost:${PORT}`);
});