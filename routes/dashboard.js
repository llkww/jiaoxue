const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const {
  getStudentDashboard,
  getTeacherDashboard,
  getAdminDashboard
} = require('../services/dashboardService');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const currentUser = req.session.user;
  const currentTerm = res.locals.currentTerm;
  let dashboardData = {};

  if (currentUser.role === 'student') {
    dashboardData = await getStudentDashboard(currentUser.profileId, currentTerm?.id, currentUser.role);
  } else if (currentUser.role === 'teacher') {
    dashboardData = await getTeacherDashboard(currentUser.profileId, currentTerm?.id, currentUser.role);
  } else {
    dashboardData = await getAdminDashboard(currentUser.role);
  }

  return res.render('pages/dashboard', {
    pageTitle: '工作台',
    dashboardData
  });
});

module.exports = router;
