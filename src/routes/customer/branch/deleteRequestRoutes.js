const express = require('express');
const router = express.Router();
const deleteRequestController = require('../../../controllers/customer/branch/deleteRequestController');

// Authentication routes
router.get('/list', deleteRequestController.list);
router.post('/update-status', deleteRequestController.updateStatus);

module.exports = router;
