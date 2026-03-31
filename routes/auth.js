const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { redirectIfAuthenticated, requireAuth } = require('../middlewares/auth');
const { getSessionUser } = require('../services/userService');
const { ROLE, USER_STATUS, LOGIN_ROLE_VALUES, getRoleLabel } = require('../utils/system');

const router = express.Router();

function normaliseLoginRole(value) {
  return LOGIN_ROLE_VALUES.includes(value) ? value : ROLE.STUDENT;
}

function extractLoginForm(body = {}) {
  return {
    login_role: normaliseLoginRole(body.login_role),
    username: body.username?.trim() || ''
  };
}

async function renderAuthPage(res, overrides = {}) {
  const loginMode = normaliseLoginRole(overrides.loginMode);
  const viewModel = {
    layout: 'auth-layout',
    bodyClass: 'auth-body-login',
    pageTitle: '登录',
    loginMode,
    loginError: overrides.loginError,
    loginForm: {
      login_role: loginMode,
      username: overrides.loginForm?.username || ''
    }
  };

  Object.assign(res.locals, viewModel);
  return res.render('pages/auth/login', viewModel);
}

router.get('/login', redirectIfAuthenticated, async (req, res) => {
  await renderAuthPage(res, {
    loginMode: req.query.mode
  });
});

router.post('/login', redirectIfAuthenticated, async (req, res) => {
  const loginRole = normaliseLoginRole(req.body.login_role);
  const username = req.body.username?.trim() || '';
  const { password } = req.body;

  if (!username || !password) {
    await renderAuthPage(res.status(400), {
      loginMode: loginRole,
      loginError: '请输入账号和密码。',
      loginForm: { username, login_role: loginRole }
    });
    return;
  }

  const users = await query(
    `
      SELECT *
      FROM users
      WHERE username = ?
      LIMIT 1
    `,
    [username]
  );

  const user = users[0];

  if (!user) {
    await renderAuthPage(res.status(400), {
      loginMode: loginRole,
      loginError: '账号或密码不正确。',
      loginForm: { username, login_role: loginRole }
    });
    return;
  }

  if (user.role !== loginRole) {
    await renderAuthPage(res.status(400), {
      loginMode: loginRole,
      loginError: `该账号属于${getRoleLabel(user.role)}身份，请切换后再登录。`,
      loginForm: { username, login_role: loginRole }
    });
    return;
  }

  if (user.status !== USER_STATUS.ENABLED) {
    await renderAuthPage(res.status(403), {
      loginMode: loginRole,
      loginError: '当前账号已被停用，请联系管理员处理。',
      loginForm: { username, login_role: loginRole }
    });
    return;
  }

  const passwordMatched = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatched) {
    await renderAuthPage(res.status(400), {
      loginMode: loginRole,
      loginError: '账号或密码不正确。',
      loginForm: { username, login_role: loginRole }
    });
    return;
  }

  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  req.session.user = await getSessionUser(user.id);

  req.flash('success', `欢迎回来，${req.session.user.fullName}。`);
  return res.redirect('/dashboard');
});

router.post('/register', redirectIfAuthenticated, async (req, res) => {
  const loginForm = extractLoginForm(req.body);
  req.flash('danger', '账号由管理员统一创建，请联系管理端办理。');
  return res.redirect(`/auth/login?mode=${loginForm.login_role}`);
});

router.post('/logout', requireAuth, async (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;
