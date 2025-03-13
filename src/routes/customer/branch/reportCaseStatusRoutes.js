const express = require("express");
const router = express.Router();
const reportCaseStatusController = require("../../../controllers/customer/branch/reportCaseStatusController");

// Basic routes
router.get("/annexure-data", reportCaseStatusController.annexureData);
router.get("/list", reportCaseStatusController.list);

router.get(
  "/report-form-json-by-service-id",
  reportCaseStatusController.reportFormJsonByServiceID
);

router.get(
  "/services-annexure-data",
  reportCaseStatusController.annexureDataByServiceIds
);
module.exports = router;
