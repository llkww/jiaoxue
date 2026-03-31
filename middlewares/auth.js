function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('warning', '请先登录后再继续访问。');
    return res.redirect('/auth/login');
  }

  return next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash('warning', '请先登录后再继续访问。');
      return res.redirect('/auth/login');
    }

    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('pages/errors/403', {
        layout: 'layout',
        pageTitle: '无权限访问'
      });
    }

    return next();
  };
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }

  return next();
}

module.exports = {
  requireAuth,
  requireRoles,
  redirectIfAuthenticated
};
