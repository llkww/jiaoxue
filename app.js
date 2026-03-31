require('express-async-errors');

const path = require('path');
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const config = require('./config/env');
const createSessionMiddleware = require('./config/session');
const flashMiddleware = require('./middlewares/flash');
const localsMiddleware = require('./middlewares/locals');
const { ping } = require('./config/database');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const profileRoutes = require('./routes/profile');
const announcementRoutes = require('./routes/announcements');
const studentRoutes = require('./routes/student');
const teacherRoutes = require('./routes/teacher');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');

app.use(expressLayouts);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  methodOverride((req) => {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
      const method = req.body._method;
      delete req.body._method;
      return method;
    }

    if (req.query && typeof req.query._method === 'string') {
      return req.query._method;
    }

    return undefined;
  })
);
app.use(express.static(path.join(__dirname, 'public')));
app.use(createSessionMiddleware());
app.use(flashMiddleware);
app.use(localsMiddleware);

app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/profile', profileRoutes);
app.use('/announcements', announcementRoutes);
app.use('/student', studentRoutes);
app.use('/teacher', teacherRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('pages/errors/404', {
    layout: req.session.user ? 'layout' : 'auth-layout',
    pageTitle: '页面未找到'
  });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).render('pages/errors/500', {
    layout: req.session.user ? 'layout' : 'auth-layout',
    pageTitle: '系统错误',
    errorMessage: '请求未能完成，请稍后再试。'
  });
});

app.listen(config.port, async () => {
  try {
    await ping();
    console.log(`教学管理系统已启动：http://localhost:${config.port}`);
  } catch (error) {
    console.warn('应用已启动，但数据库尚未连通，请先执行 npm run init-db。');
  }
});
