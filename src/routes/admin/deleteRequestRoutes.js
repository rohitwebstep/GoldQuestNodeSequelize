const express = require('express');
const router = express.Router();
const deleteRequestController = require('../../controllers/admin/deleteRequestController');

// Authentication routes
router.post('/create', deleteRequestController.create);
router.get('/list', deleteRequestController.list);

module.exports = router;
