const express = require('express');
const router = express.Router();

// Render the home page
router.get('/', (req, res) => {
  res.render('index', { title: 'Smart Warehouse Dashboard' });
});

module.exports = router;
