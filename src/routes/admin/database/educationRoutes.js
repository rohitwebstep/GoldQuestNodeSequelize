const express = require("express");
const router = express.Router();
const educationController = require("../../../controllers/admin/database/educationController");

// Basic routes
router.post("/create", educationController.create);
router.get("/list", educationController.list);
router.put("/update", educationController.update);
router.delete("/delete", educationController.delete);

module.exports = router;
