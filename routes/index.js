const express = require('express');
const { ping } = require('../config/database');

const router = express.Router();

router.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return res.redirect('/auth/login');
});

router.get('/health', async (req, res) => {
  try {
    await ping();
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;
