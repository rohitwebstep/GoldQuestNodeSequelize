const express = require("express");
const router = express.Router();
const apiClientController = require("../../../../controllers/customer/branch/api/client/applicationController");

// Basic routes
router.post("/create", apiClientController.create);
module.exports = router;