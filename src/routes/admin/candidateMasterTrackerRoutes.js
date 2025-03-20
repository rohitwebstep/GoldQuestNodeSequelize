const express = require("express");
const router = express.Router();
const candidateMasterTrackerController = require("../../controllers/admin/candidateMasterTrackerController");

// Authentication routes
router.get("/list", candidateMasterTrackerController.list);
router.get("/test", candidateMasterTrackerController.test);
router.get(
  "/branch-list-by-customer",
  candidateMasterTrackerController.listByCustomerId
);
router.get(
  "/applications-by-branch",
  candidateMasterTrackerController.applicationListByBranch
);

router.get(
  "/gap-check",
  candidateMasterTrackerController.gapCheck
);

router.get(
  "/bgv-application-by-id",
  candidateMasterTrackerController.cefApplicationByID
);
router.get(
  "/dav-application-by-id",
  candidateMasterTrackerController.davApplicationByID
);
router.get("/filter-options", candidateMasterTrackerController.filterOptions);
router.get("/send", candidateMasterTrackerController.sendLink);
router.get(
  "/branch-filter-options",
  candidateMasterTrackerController.filterOptionsForBranch
);
module.exports = router;
