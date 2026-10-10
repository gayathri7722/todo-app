/* Task Manager: vanilla JavaScript, state-driven.
   - One `state` object is the single source of truth.
   - Every change goes through a small function, then save() + render().
   - render() builds the list with createElement (never innerHTML), so user text is always safe.
   - One delegated listener per event type on the list, not one per task. */
(function () {
  'use strict';

  var STORAGE_KEY = 'thiranex.todo.v1';
  var PRIORITIES = ['low', 'medium', 'high'];
  var FILTERS = ['all', 'active', 'completed'];
  var MAX_LEN = 120;

  var state = { tasks: [], filter: 'all', editingId: null };
  var storageOk = true;
  var pendingFocus = null;

  var $ = function (sel) { return document.querySelector(sel); };
  var el = {
    form: $('#task-form'),
    input: $('#task-input'),
    priority: $('#task-priority'),
    error: $('#task-error'),
    list: $('#task-list'),
    empty: $('#empty-state'),
    left: $('#items-left'),
    clear: $('#clear-completed'),
    filters: $('#filters'),
    announcer: $('#announcer'),
    notice: $('#storage-notice'),
    bar: $('#progress-bar'),
    theme: $('#theme-toggle')
  };

  /* ---------- Persistence (window.localStorage) ---------- */
  function checkStorage() {
    try {
      var k = '__storage_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) { return false; }
  }

  function cleanTask(t) {
    if (!t || typeof t.id !== 'string' || typeof t.text !== 'string') return null;
    var text = t.text.trim().slice(0, MAX_LEN);
    if (!text) return null;
    return {
      id: t.id,
      text: text,
      done: t.done === true,
      priority: PRIORITIES.indexOf(t.priority) > -1 ? t.priority : 'medium'
    };
  }

  function load() {
    if (!storageOk) return;
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.tasks)) return;
      state.tasks = data.tasks.map(cleanTask).filter(Boolean);
      if (FILTERS.indexOf(data.filter) > -1) state.filter = data.filter;
    } catch (e) {
      state.tasks = []; /* corrupted data: start fresh instead of crashing */
    }
  }

  function save() {
    if (!storageOk) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks: state.tasks, filter: state.filter }));
    } catch (e) {
      storageOk = false;
      el.notice.hidden = false;
    }
  }

  /* ---------- State changes (Create, Update, Delete) ---------- */
  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function findTask(id) {
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i];
    return null;
  }

  function addTask(text, priority) {
    var task = { id: makeId(), text: text, done: false, priority: PRIORITIES.indexOf(priority) > -1 ? priority : 'medium' };
    state.tasks.unshift(task);
    commit('Task added: ' + text);
  }

  function updateTask(id, text, priority) {
    var task = findTask(id);
    if (!task) return;
    task.text = text;
    task.priority = PRIORITIES.indexOf(priority) > -1 ? priority : task.priority;
    state.editingId = null;
    pendingFocus = ['[data-id="' + cssEsc(id) + '"] [data-action="edit"]'];
    commit('Task updated: ' + text);
  }

  function toggleTask(id) {
    var task = findTask(id);
    if (!task) return;
    task.done = !task.done;
    pendingFocus = ['[data-id="' + cssEsc(id) + '"] .task-check', '#task-input'];
    commit('Task marked ' + (task.done ? 'completed' : 'active') + ': ' + task.text);
  }

  function deleteTask(id) {
    var task = findTask(id);
    if (!task) return;
    var before = visibleTasks();
    var index = before.indexOf(task);
    state.tasks = state.tasks.filter(function (t) { return t.id !== id; });
    if (state.editingId === id) state.editingId = null;
    var after = visibleTasks();
    var next = after[index] || after[index - 1];
    pendingFocus = next ? ['[data-id="' + cssEsc(next.id) + '"] .task-check'] : ['#task-input'];
    commit('Task deleted: ' + task.text);
  }

  function clearCompleted() {
    var n = state.tasks.filter(function (t) { return t.done; }).length;
    if (!n) return;
    state.tasks = state.tasks.filter(function (t) { return !t.done; });
    pendingFocus = ['#task-input'];
    commit(n + (n === 1 ? ' completed task cleared' : ' completed tasks cleared'));
  }

  function setFilter(filter) {
    if (FILTERS.indexOf(filter) === -1 || filter === state.filter) return;
    state.filter = filter;
    state.editingId = null;
    commit('Showing ' + filter + ' tasks');
  }

  function commit(message) {
    save();
    render();
    if (message) announce(message);
  }

  /* ---------- Derived data ---------- */
  function visibleTasks() {
    return state.tasks.filter(function (t) {
      if (state.filter === 'active') return !t.done;
      if (state.filter === 'completed') return t.done;
      return true;
    });
  }

  function counts() {
    var done = state.tasks.filter(function (t) { return t.done; }).length;
    return { all: state.tasks.length, active: state.tasks.length - done, completed: done };
  }

  /* ---------- Rendering (dynamic DOM) ---------- */
  function node(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k];
      else if (k === 'class') n.className = props[k];
      else if (k === 'data') Object.keys(props[k]).forEach(function (d) { n.dataset[d] = props[k][d]; });
      else if (k in n) n[k] = props[k];
      else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function buildItem(task) {
    var li = node('li', { class: 'task' + (task.done ? ' is-done' : ''), data: { id: task.id, priority: task.priority } });

    if (state.editingId === task.id) {
      var opts = PRIORITIES.map(function (p) { return node('option', { value: p, text: cap(p), selected: p === task.priority }); });
      var form = node('form', { class: 'edit-form', novalidate: true, 'aria-label': 'Edit task' }, [
        node('input', { type: 'text', class: 'edit-input', value: task.text, maxLength: MAX_LEN, 'aria-label': 'Task text', autocomplete: 'off' }),
        node('select', { class: 'edit-priority', 'aria-label': 'Priority' }, opts),
        node('div', { class: 'edit-buttons' }, [
          node('button', { type: 'submit', class: 'btn', text: 'Save' }),
          node('button', { type: 'button', class: 'btn-ghost', text: 'Cancel', data: { action: 'cancel' } })
        ]),
        node('p', { class: 'edit-error', role: 'alert' })
      ]);
      li.appendChild(form);
      return li;
    }

    var checkId = 'chk-' + task.id;
    li.appendChild(node('input', { type: 'checkbox', class: 'task-check', id: checkId, checked: task.done }));
    li.appendChild(node('div', { class: 'task-body' }, [
      node('label', { class: 'task-text', htmlFor: checkId, text: task.text }),
      node('span', { class: 'badge', text: cap(task.priority) + ' priority' })
    ]));
    li.appendChild(node('div', { class: 'task-actions' }, [
      node('button', { type: 'button', class: 'btn-ghost', text: 'Edit', 'aria-label': 'Edit task: ' + task.text, data: { action: 'edit' } }),
      node('button', { type: 'button', class: 'btn-ghost danger', text: 'Delete', 'aria-label': 'Delete task: ' + task.text, data: { action: 'delete' } })
    ]));
    return li;
  }

  function render() {
    var visible = visibleTasks();
    var c = counts();

    el.list.replaceChildren.apply(el.list, visible.map(buildItem));

    /* empty states */
    var msg = '';
    if (!state.tasks.length) msg = 'No tasks yet. Add your first task above.';
    else if (!visible.length) msg = state.filter === 'active' ? 'No active tasks. Everything is done!' : 'No completed tasks yet.';
    el.empty.textContent = msg;
    el.empty.hidden = !msg;

    /* filter buttons and counts */
    Array.prototype.forEach.call(el.filters.querySelectorAll('[data-filter]'), function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === state.filter));
    });
    FILTERS.forEach(function (f) { $('[data-count="' + f + '"]').textContent = c[f]; });

    el.left.textContent = c.active + (c.active === 1 ? ' task left' : ' tasks left');
    el.clear.disabled = c.completed === 0;
    el.bar.style.width = (c.all ? Math.round((c.completed / c.all) * 100) : 0) + '%';

    /* move focus where the user expects it */
    if (pendingFocus) {
      for (var i = 0; i < pendingFocus.length; i++) {
        var target = document.querySelector(pendingFocus[i]);
        if (target) { target.focus(); break; }
      }
      pendingFocus = null;
    }
  }

  function announce(message) {
    el.announcer.textContent = '';
    window.setTimeout(function () { el.announcer.textContent = message; }, 50);
  }

  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  /* ---------- Event listeners ---------- */
  /* Add form */
  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = el.input.value.trim();
    if (!text) {
      el.error.textContent = 'Enter a task before adding it.';
      el.input.setAttribute('aria-invalid', 'true');
      el.input.focus();
      return;
    }
    el.error.textContent = '';
    el.input.removeAttribute('aria-invalid');
    addTask(text.slice(0, MAX_LEN), el.priority.value);
    el.input.value = '';
    el.input.focus();
  });
  el.input.addEventListener('input', function () {
    if (el.input.value.trim()) { el.error.textContent = ''; el.input.removeAttribute('aria-invalid'); }
  });

  /* Delegated listeners on the list: one per event type, covering every task */
  el.list.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn || !el.list.contains(btn)) return;
    var li = btn.closest('.task');
    var id = li && li.dataset.id;
    if (!id) return;
    var action = btn.dataset.action;
    if (action === 'edit') {
      state.editingId = id;
      pendingFocus = ['[data-id="' + cssEsc(id) + '"] .edit-input'];
      render();
      var inp = document.querySelector('.edit-input');
      if (inp) inp.select();
    } else if (action === 'cancel') {
      state.editingId = null;
      pendingFocus = ['[data-id="' + cssEsc(id) + '"] [data-action="edit"]'];
      render();
      announce('Edit cancelled');
    } else if (action === 'delete') {
      deleteTask(id);
    }
  });

  el.list.addEventListener('change', function (e) {
    if (!e.target.matches('.task-check')) return;
    var li = e.target.closest('.task');
    if (li) toggleTask(li.dataset.id);
  });

  el.list.addEventListener('submit', function (e) {
    if (!e.target.matches('.edit-form')) return;
    e.preventDefault();
    var li = e.target.closest('.task');
    var inp = e.target.querySelector('.edit-input');
    var text = inp.value.trim();
    if (!text) {
      e.target.querySelector('.edit-error').textContent = 'Task text cannot be empty.';
      inp.setAttribute('aria-invalid', 'true');
      inp.focus();
      return;
    }
    updateTask(li.dataset.id, text.slice(0, MAX_LEN), e.target.querySelector('.edit-priority').value);
  });

  el.list.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !e.target.closest('.edit-form')) return;
    var li = e.target.closest('.task');
    state.editingId = null;
    pendingFocus = ['[data-id="' + cssEsc(li.dataset.id) + '"] [data-action="edit"]'];
    render();
    announce('Edit cancelled');
  });

  /* Filters (delegated) and clear completed */
  el.filters.addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (b) setFilter(b.dataset.filter);
  });
  el.clear.addEventListener('click', clearCompleted);

  /* Keep several open tabs in sync */
  window.addEventListener('storage', function (e) {
    if (e.key !== STORAGE_KEY) return;
    state.editingId = null;
    load();
    render();
  });

  /* Theme toggle */
  function themeSync() { el.theme.setAttribute('aria-pressed', String(document.documentElement.getAttribute('data-theme') === 'dark')); }
  if (el.theme) {
    themeSync();
    el.theme.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { window.localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
      themeSync();
    });
  }

  /* ---------- Start ---------- */
  storageOk = checkStorage();
  el.notice.hidden = storageOk;
  load();
  render();
})();
