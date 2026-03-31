function flashMiddleware(req, res, next) {
  req.flash = (type, message) => {
    req.session.flash = req.session.flash || {};
    req.session.flash[type] = req.session.flash[type] || [];
    req.session.flash[type].push(message);
  };

  res.locals.flash = req.session.flash || {};
  delete req.session.flash;

  next();
}

module.exports = flashMiddleware;
