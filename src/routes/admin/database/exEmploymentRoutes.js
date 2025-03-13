const express = require("express");
const router = express.Router();
const exEmploymentController = require("../../../controllers/admin/database/exEmploymentController");

// Basic routes
router.post("/create", exEmploymentController.create);
router.get("/list", exEmploymentController.list);
router.put("/update", exEmploymentController.update);
router.delete("/delete", exEmploymentController.delete);

module.exports = router;
