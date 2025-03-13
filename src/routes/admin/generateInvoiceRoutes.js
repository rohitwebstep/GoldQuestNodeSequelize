const express = require("express");
const router = express.Router();
const generateInvoiceController = require("../../controllers/admin/generateInvoiceController");

// Authentication routes
router.get("/", generateInvoiceController.generateInvoice);
module.exports = router;
