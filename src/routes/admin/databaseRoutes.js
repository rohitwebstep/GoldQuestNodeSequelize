const express = require("express");
const router = express.Router();
const educationRoutes = require("./database/educationRoutes");
const exEmploymentRoutes = require("./database/exEmploymentRoutes");

router.use("/education", educationRoutes);
router.use("/ex-employeement", exEmploymentRoutes);
module.exports = router;
