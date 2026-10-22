// ---------------------------------------------------------------
// Miscelánea La Esquina — interacciones + autenticación + formulario
// ---------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initMobileMenu();
  initContactForm();
  initAdmin();
  renderCatalog();
  initAuth();
  refreshAuthState();
  document.getElementById('year').textContent = new Date().getFullYear();
});

function initMobileMenu() {
  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  toggle.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menú');
  }));
}

// ---------------------------------------------------------------
// Base de datos local: se guarda en el navegador (localStorage).
// No necesita Node.js ni MySQL.
// ---------------------------------------------------------------
const DB = { users: 'miscelanea_users', messages: 'miscelanea_messages', session: 'miscelanea_session', products: 'miscelanea_products', admin: 'miscelanea_admin' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dbRead(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; }
  catch { return fallback; }
}

function dbWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function hashPassword(password, salt) {
  const text = salt + ':' + password;
  if (window.crypto && crypto.subtle) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (const c of text) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return 'x' + h.toString(16);
}

async function api(url, options = {}) {
  const body = options.body ? JSON.parse(options.body) : {};
  const users = dbRead(DB.users, []);
  const session = dbRead(DB.session, null);

  if (url === '/api/auth/register') {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (name.length < 2 || name.length > 100) throw new Error('El nombre debe tener entre 2 y 100 caracteres.');
    if (!EMAIL_RE.test(email)) throw new Error('Introduce un correo válido.');
    if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
    if (users.some((u) => u.email === email)) throw new Error('Ya existe una cuenta con ese correo.');

    const salt = crypto.getRandomValues ? Array.from(crypto.getRandomValues(new Uint8Array(8))).join('') : String(Date.now());
    const user = { id: Date.now(), name, email, salt, passwordHash: await hashPassword(password, salt), createdAt: new Date().toISOString() };
    users.push(user);
    dbWrite(DB.users, users);
    const publicUser = { id: user.id, name, email };
    dbWrite(DB.session, publicUser);
    return { message: 'Cuenta creada correctamente.', user: publicUser };
  }

  if (url === '/api/auth/login') {
    const email = String(body.email || '').trim().toLowerCase();
    const user = users.find((u) => u.email === email);
    if (!user || (await hashPassword(String(body.password || ''), user.salt)) !== user.passwordHash) {
      throw new Error('Correo o contraseña incorrectos.');
    }
    const publicUser = { id: user.id, name: user.name, email: user.email };
    dbWrite(DB.session, publicUser);
    return { message: 'Sesión iniciada correctamente.', user: publicUser };
  }

  if (url === '/api/auth/logout') {
    localStorage.removeItem(DB.session);
    return { message: 'Sesión cerrada.' };
  }

  if (url === '/api/auth/me') {
    return { user: session };
  }

  if (url === '/api/contact') {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const message = String(body.message || '').trim();
    if (name.length < 2 || name.length > 100) throw new Error('Escribe un nombre válido.');
    if (!EMAIL_RE.test(email)) throw new Error('Escribe un correo válido.');
    if (message.length < 10) throw new Error('El mensaje debe tener al menos 10 caracteres.');
    const messages = dbRead(DB.messages, []);
    messages.push({ id: Date.now(), userId: session ? session.id : null, name, email, message, createdAt: new Date().toISOString() });
    dbWrite(DB.messages, messages);
    return { message: 'Mensaje guardado correctamente. Te contactaremos pronto.' };
  }

  throw new Error('Acción no disponible.');
}

const CATEGORIES = ['Papel y cartulinas', 'Para escribir', 'Cuadernos y carpetas', 'Manualidades', 'Oficina y servicios'];
const money = (n) => Number(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

function renderCatalog() {
  const box = document.getElementById('catalog');
  const products = dbRead(DB.products, []);
  box.hidden = products.length === 0;
  document.getElementById('catalogList').innerHTML = products
    .slice()
    .sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name, 'es'))
    .map((p) => `
      <li class="catalog__item${p.available ? '' : ' is-out'}">
        <span class="catalog__cat">${escapeHtml(p.category)}</span>
        <strong>${escapeHtml(p.name)}</strong>
        <span class="catalog__price">${money(p.price)}${p.available ? '' : ' <em>Agotado</em>'}</span>
      </li>`).join('');
}

function initAdmin() {
  const $ = (id) => document.getElementById(id);
  const root = $('admin'), gate = $('adminGate'), panel = $('adminPanel');
  const gatePass = $('gatePass'), gateStatus = $('gateStatus');
  let editingId = null;

  $('pCategory').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');

  // ---- Entrada con contraseña ----
  const showGate = () => {
    const first = !dbRead(DB.admin, null);
    $('gateTitle').textContent = first ? 'Crea tu contraseña de administrador' : 'Entrar al panel';
    $('gateHelp').textContent = first
      ? 'La usarás cada vez que administres la página. Mínimo 6 caracteres.'
      : 'Escribe la contraseña de administrador.';
    $('gateBtn').textContent = first ? 'Crear contraseña' : 'Entrar';
    gatePass.autocomplete = first ? 'new-password' : 'current-password';
    gate.hidden = false;
    panel.hidden = true;
    gateStatus.textContent = '';
    gatePass.value = '';
    setTimeout(() => gatePass.focus(), 0);
  };

  const open = () => { root.hidden = false; document.body.classList.add('modal-open'); showGate(); };
  const close = () => {
    root.hidden = true;
    panel.hidden = true;
    document.body.classList.remove('modal-open');
    try { if (location.hash === '#admin') history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* nada */ }
  };

  $('openAdmin').addEventListener('click', open);
  $('adminExit').addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !root.hidden) close(); });
  if (location.hash === '#admin') open();

  gate.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = gatePass.value;
    const saved = dbRead(DB.admin, null);
    if (!saved) {
      if (pass.length < 6) { gateStatus.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
      const salt = String(Date.now()) + Math.random();
      dbWrite(DB.admin, { salt, hash: await hashPassword(pass, salt) });
    } else if ((await hashPassword(pass, saved.salt)) !== saved.hash) {
      gateStatus.textContent = 'Contraseña incorrecta.';
      return;
    }
    gate.hidden = true;
    panel.hidden = false;
    renderAll();
  });

  // ---- Pestañas ----
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    ['productos', 'mensajes', 'usuarios'].forEach((t) => { $('tab-' + t).hidden = t !== btn.dataset.tab; });
  }));

  // ---- Productos ----
  const resetForm = () => {
    editingId = null;
    $('pForm').reset();
    $('pAvailable').checked = true;
    $('pFormTitle').textContent = 'Agregar producto';
    $('pSave').textContent = 'Guardar producto';
    $('pCancel').hidden = true;
    $('pStatus').textContent = '';
  };

  const renderProducts = () => {
    const products = dbRead(DB.products, []);
    $('cntProductos').textContent = `(${products.length})`;
    $('pList').innerHTML = products.length ? products.map((p) => `
      <li class="a-row" data-id="${p.id}">
        <div class="a-row__main">
          <strong>${escapeHtml(p.name)}</strong>
          <span>${escapeHtml(p.category)}</span>
          <span>${money(p.price)}</span>
          ${p.available ? '' : '<span class="a-tag">Agotado</span>'}
        </div>
        <div class="a-actions">
          <button type="button" data-act="toggle">${p.available ? 'Marcar agotado' : 'Marcar disponible'}</button>
          <button type="button" data-act="edit">Editar</button>
          <button type="button" data-act="del" class="is-danger">Eliminar</button>
        </div>
      </li>`).join('') : '<li class="a-empty">Aún no hay productos. Agrega el primero arriba y aparecerá en la página.</li>';
  };

  $('pForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('pName').value.trim();
    const price = Number($('pPrice').value);
    if (name.length < 2) { $('pStatus').textContent = 'Escribe el nombre del producto.'; return; }
    if ($('pPrice').value === '' || !(price >= 0)) { $('pStatus').textContent = 'Escribe un precio válido.'; return; }
    const products = dbRead(DB.products, []);
    const data = { name, category: $('pCategory').value, price, available: $('pAvailable').checked };
    if (editingId) {
      const item = products.find((p) => p.id === editingId);
      if (item) Object.assign(item, data);
    } else {
      products.push({ id: Date.now(), ...data });
    }
    dbWrite(DB.products, products);
    resetForm();
    $('pStatus').textContent = 'Producto guardado.';
    renderProducts();
    renderCatalog();
  });

  $('pCancel').addEventListener('click', resetForm);

  $('pList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('.a-row').dataset.id);
    let products = dbRead(DB.products, []);
    const item = products.find((p) => p.id === id);
    if (!item) return;

    if (btn.dataset.act === 'toggle') {
      item.available = !item.available;
    } else if (btn.dataset.act === 'del') {
      if (!confirm(`¿Eliminar "${item.name}"?`)) return;
      products = products.filter((p) => p.id !== id);
      if (editingId === id) resetForm();
    } else if (btn.dataset.act === 'edit') {
      editingId = id;
      $('pName').value = item.name;
      $('pCategory').value = item.category;
      $('pPrice').value = item.price;
      $('pAvailable').checked = item.available;
      $('pFormTitle').textContent = 'Editar producto';
      $('pSave').textContent = 'Guardar cambios';
      $('pCancel').hidden = false;
      $('pStatus').textContent = '';
      $('pName').focus();
      return;
    }
    dbWrite(DB.products, products);
    renderProducts();
    renderCatalog();
  });

  // ---- Mensajes ----
  const renderMessages = () => {
    const messages = dbRead(DB.messages, []).slice().reverse();
    $('cntMensajes').textContent = `(${messages.length})`;
    $('msgExport').disabled = $('msgClear').disabled = messages.length === 0;
    $('msgList').innerHTML = messages.length ? messages.map((m) => `
      <li class="a-row a-row--stack" data-id="${m.id}">
        <div class="a-row__main">
          <strong>${escapeHtml(m.name)}</strong>
          <a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a>
          <span>${new Date(m.createdAt).toLocaleString('es-CO')}</span>
        </div>
        <p>${escapeHtml(m.message)}</p>
        <div class="a-actions"><button type="button" data-act="del" class="is-danger">Eliminar</button></div>
      </li>`).join('') : '<li class="a-empty">Todavía no hay mensajes. Aparecerán aquí cuando alguien use el formulario de contacto.</li>';
  };

  $('msgList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="del"]');
    if (!btn) return;
    const id = btn.closest('.a-row').dataset.id;
    dbWrite(DB.messages, dbRead(DB.messages, []).filter((m) => String(m.id) !== id));
    renderMessages();
  });

  $('msgClear').addEventListener('click', () => {
    if (confirm('¿Borrar todos los mensajes?')) { dbWrite(DB.messages, []); renderMessages(); }
  });

  $('msgExport').addEventListener('click', () => {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const rows = [['Fecha', 'Nombre', 'Correo', 'Mensaje'].map(q).join(',')]
      .concat(dbRead(DB.messages, []).map((m) => [new Date(m.createdAt).toLocaleString('es-CO'), m.name, m.email, m.message].map(q).join(',')));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
    link.download = 'mensajes.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  });

  // ---- Usuarios ----
  const renderUsers = () => {
    const users = dbRead(DB.users, []);
    $('cntUsuarios').textContent = `(${users.length})`;
    $('userList').innerHTML = users.length ? users.map((u) => `
      <li class="a-row" data-id="${u.id}">
        <div class="a-row__main">
          <strong>${escapeHtml(u.name)}</strong>
          <span>${escapeHtml(u.email)}</span>
          <span>Desde ${new Date(u.createdAt).toLocaleDateString('es-CO')}</span>
        </div>
        <div class="a-actions"><button type="button" data-act="del" class="is-danger">Eliminar</button></div>
      </li>`).join('') : '<li class="a-empty">Nadie se ha registrado todavía.</li>';
  };

  $('userList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act="del"]');
    if (!btn) return;
    const id = Number(btn.closest('.a-row').dataset.id);
    const user = dbRead(DB.users, []).find((u) => u.id === id);
    if (!user || !confirm(`¿Eliminar la cuenta de ${user.name}?`)) return;
    dbWrite(DB.users, dbRead(DB.users, []).filter((u) => u.id !== id));
    const session = dbRead(DB.session, null);
    if (session && session.id === id) localStorage.removeItem(DB.session);
    renderUsers();
  });

  function renderAll() { renderProducts(); renderMessages(); renderUsers(); }
}

function initAuth() {
  const modal = document.getElementById('authModal');
  const close = document.getElementById('closeAuth');
  const form = document.getElementById('authForm');
  const switchBtn = document.getElementById('authSwitch');
  const nameField = document.getElementById('authNameField');
  const title = document.getElementById('authTitle');
  const description = document.getElementById('authDescription');
  const submit = document.getElementById('authSubmit');
  const status = document.getElementById('authStatus');
  const openLogin = document.getElementById('openLogin');
  const openRegister = document.getElementById('openRegister');
  let mode = 'login';

  const setMode = (newMode) => {
    mode = newMode;
    const register = mode === 'register';
    title.textContent = register ? 'Crear cuenta' : 'Iniciar sesión';
    description.textContent = register ? 'Crea tu cuenta para guardar tus datos y hacer pedidos.' : 'Accede a tu cuenta para hacer tus pedidos.';
    nameField.hidden = !register;
    document.getElementById('authName').required = register;
    document.getElementById('authPassword').autocomplete = register ? 'new-password' : 'current-password';
    submit.textContent = register ? 'Crear cuenta' : 'Iniciar sesión';
    switchBtn.textContent = register ? '¿Ya tienes cuenta? Iniciar sesión' : '¿No tienes cuenta? Crear cuenta';
    status.textContent = '';
  };

  const open = (newMode) => {
    setMode(newMode);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => document.getElementById('authEmail').focus(), 0);
  };

  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    form.reset();
    status.textContent = '';
  };

  openLogin.addEventListener('click', () => open('login'));
  openRegister.addEventListener('click', () => open('register'));
  close.addEventListener('click', closeModal);
  modal.querySelector('[data-close-auth]').addEventListener('click', closeModal);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });
  switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = 'Procesando...';
    submit.disabled = true;

    const payload = {
      name: document.getElementById('authName').value.trim(),
      email: document.getElementById('authEmail').value.trim(),
      password: document.getElementById('authPassword').value
    };

    try {
      const result = await api(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST', body: JSON.stringify(payload)
      });
      status.textContent = result.message;
      form.reset();
      await refreshAuthState();
      setTimeout(closeModal, 500);
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
}

async function refreshAuthState() {
  const area = document.getElementById('authArea');
  if (!area) return;
  try {
    const result = await api('/api/auth/me', { method: 'GET', headers: {} });
    if (result.user) {
      area.innerHTML = `
        <span class="auth-user">Hola, ${escapeHtml(result.user.name)}</span>
        <button type="button" class="auth-btn auth-btn--login" id="logoutBtn">Cerrar sesión</button>
      `;
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await api('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
        refreshAuthState();
      });
    }
  } catch (error) {
    console.warn(error.message);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function initContactForm() {
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');
  const submitBtn = document.getElementById('submitBtn');
  const fields = {
    name: {
      input: document.getElementById('name'),
      error: document.getElementById('nameError'),
      validate: (value) => value.trim().length >= 2,
      message: 'Escribe tu nombre completo.'
    },
    email: {
      input: document.getElementById('email'),
      error: document.getElementById('emailError'),
      validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
      message: 'Escribe un correo electrónico válido.'
    },
    message: {
      input: document.getElementById('message'),
      error: document.getElementById('messageError'),
      validate: (value) => value.trim().length >= 10,
      message: 'Cuéntanos qué necesitas (mínimo 10 caracteres).'
    }
  };

  const validateField = (field) => {
    const valid = field.validate(field.input.value);
    field.input.classList.toggle('is-invalid', !valid);
    field.error.textContent = valid ? '' : field.message;
    return valid;
  };

  Object.values(fields).forEach((field) => {
    field.input.addEventListener('blur', () => validateField(field));
    field.input.addEventListener('input', () => {
      if (field.input.classList.contains('is-invalid')) validateField(field);
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const allValid = Object.values(fields).map(validateField).every(Boolean);
    if (!allValid) {
      status.textContent = 'Revisa los campos señalados antes de continuar.';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    try {
      const result = await api('/api/contact', {
        method: 'POST',
        body: JSON.stringify({
          name: fields.name.input.value.trim(),
          email: fields.email.input.value.trim(),
          message: fields.message.input.value.trim()
        })
      });
      status.textContent = result.message;
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar mensaje';
    }
  });
}
