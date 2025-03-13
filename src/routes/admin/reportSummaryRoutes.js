const express = require("express");
const router = express.Router();
const reportSummaryController = require("../../controllers/admin/reportSummaryController");

// Authentication routes
router.get("/report-tracker", reportSummaryController.reportTracker);
router.get("/report-generation", reportSummaryController.reportGeneration);
module.exports = router;
