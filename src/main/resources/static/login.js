/**
 * 智慧烟感预警系统 - 登录/注册页
 * 登录成功后根据 role 跳转：
 *   RESIDENT → /user/index.html（居民用户端）
 *   其他     → /fe2/dashboard-enhanced.html（管理端大屏）
 */
(function () {
  'use strict';

  const API_BASE = '/api/v1';

  // ===== DOM 元素 =====
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');
  const btnLogin = document.getElementById('btnLogin');
  const btnRegister = document.getElementById('btnRegister');
  const roleOptions = document.querySelectorAll('.role-option');

  // ===== Tab 切换 =====
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', function () {
      const target = this.dataset.tab;
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      if (target === 'login') {
        loginForm.classList.add('active');
      } else {
        registerForm.classList.add('active');
      }
      loginError.textContent = '';
      registerError.textContent = '';
    });
  });

  // ===== 角色选择 =====
  roleOptions.forEach(opt => {
    opt.addEventListener('click', function () {
      roleOptions.forEach(o => o.classList.remove('active'));
      this.classList.add('active');
      this.querySelector('input[type="radio"]').checked = true;
    });
  });

  // ===== 通用 API 请求 =====
  async function apiPost(url, body) {
    const resp = await fetch(API_BASE + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return resp.json();
  }

  // ===== 登录 =====
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginError.textContent = '';
    setBtnLoading(btnLogin, true);

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
      loginError.textContent = '请输入用户名和密码';
      setBtnLoading(btnLogin, false);
      return;
    }

    try {
      const data = await apiPost('/auth/login', { username, password });

      if (data.code === 200 && data.data) {
        // 保存 token 和用户信息（使用 smoke_token 与 Vue 管理端一致）
        localStorage.setItem('smoke_token', data.data.token);
        localStorage.setItem('smoke_user', JSON.stringify(data.data.user));

        // 根据角色跳转
        const role = data.data.user.role;
        if (role === 'RESIDENT') {
          window.location.href = '/user/index.html';
        } else {
          window.location.href = '/fe2/dashboard-enhanced.html';
        }
      } else {
        loginError.textContent = data.msg || '登录失败，请检查用户名和密码';
      }
    } catch (err) {
      loginError.textContent = '网络异常，请稍后重试';
    } finally {
      setBtnLoading(btnLogin, false);
    }
  });

  // ===== 注册 =====
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    registerError.textContent = '';
    setBtnLoading(btnRegister, true);

    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;
    const realName = document.getElementById('regRealName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const role = document.querySelector('input[name="regRole"]:checked').value;

    if (!username || !password || !passwordConfirm) {
      registerError.textContent = '请填写必填字段';
      setBtnLoading(btnRegister, false);
      return;
    }

    if (password.length < 6) {
      registerError.textContent = '密码至少需要 6 位';
      setBtnLoading(btnRegister, false);
      return;
    }

    if (password !== passwordConfirm) {
      registerError.textContent = '两次输入的密码不一致';
      setBtnLoading(btnRegister, false);
      return;
    }

    try {
      const data = await apiPost('/auth/register', {
        username,
        password,
        realName: realName || undefined,
        phone: phone || undefined,
        role,
      });

      if (data.code === 200 && data.data) {
        // 注册成功，自动登录
        localStorage.setItem('smoke_token', data.data.token);
        localStorage.setItem('smoke_user', JSON.stringify(data.data.user));

        // 根据角色跳转
        const userRole = data.data.user.role;
        if (userRole === 'RESIDENT') {
          window.location.href = '/user/index.html';
        } else {
          window.location.href = '/fe2/dashboard-enhanced.html';
        }
      } else {
        registerError.textContent = data.msg || '注册失败';
      }
    } catch (err) {
      registerError.textContent = '网络异常，请稍后重试';
    } finally {
      setBtnLoading(btnRegister, false);
    }
  });

  // ===== 辅助函数 =====
  function setBtnLoading(btn, loading) {
    const textEl = btn.querySelector('.btn-text');
    const loadingEl = btn.querySelector('.btn-loading');
    if (loading) {
      textEl.classList.add('hidden');
      loadingEl.classList.remove('hidden');
      btn.disabled = true;
      btn.style.opacity = '0.7';
    } else {
      textEl.classList.remove('hidden');
      loadingEl.classList.add('hidden');
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  }

  // ===== 登录页始终展示，不做自动跳转（方便同时演示管理端和用户端） =====
  // 如需清除登录态，在浏览器控制台执行: localStorage.clear()

})();
