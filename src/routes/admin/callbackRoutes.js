const express = require("express");
const router = express.Router();
const callbackController = require("../../controllers/admin/callbackController");

// Basic routes
router.get("/list", callbackController.list);

module.exports = router;
