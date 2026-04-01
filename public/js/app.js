let pendingConfirmForm = null;
let activeFilterSelect = null;
let filterGlobalsBound = false;
const FILTER_SEARCH_THRESHOLD = 8;

function getVisibleFilterOptions(root) {
  return Array.from(root.querySelectorAll('.filter-option')).filter((option) => !option.hidden);
}

function focusFilterOption(wrapper, index) {
  if (!wrapper) {
    return;
  }

  const options = getVisibleFilterOptions(wrapper);

  if (!options.length) {
    return;
  }

  const safeIndex = Math.max(0, Math.min(index, options.length - 1));
  options[safeIndex].focus();
}

function closeFilterSelect(except = null) {
  document.querySelectorAll('.filter-select.is-open').forEach((select) => {
    if (select === except) {
      return;
    }

    select.classList.remove('is-open');
    const trigger = select.querySelector('.filter-select-trigger');
    const menu = select.querySelector('.filter-select-menu');

    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
    }

    if (menu) {
      menu.hidden = true;
    }
  });

  activeFilterSelect = except || null;
}

function initConfirmLayer() {
  const layer = document.getElementById('confirm-layer');
  const title = document.getElementById('confirm-title');
  const body = document.getElementById('confirm-body');
  const cancelButton = document.getElementById('confirm-cancel');
  const submitButton = document.getElementById('confirm-submit');

  if (!layer || !title || !body || !cancelButton || !submitButton) {
    return;
  }

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement) || !form.matches('form[data-confirm]')) {
        return;
      }

      if (form.dataset.confirmed === 'true') {
        form.dataset.confirmed = 'false';
        return;
      }

      event.preventDefault();
      pendingConfirmForm = form;
      title.textContent = form.dataset.confirmTitle || '确认执行当前操作？';
      body.textContent = form.dataset.confirm || '这一操作会直接写入系统数据，请确认内容无误。';
      layer.hidden = false;
    },
    true
  );

  cancelButton.addEventListener('click', () => {
    pendingConfirmForm = null;
    layer.hidden = true;
  });

  layer.addEventListener('click', (event) => {
    if (event.target === layer) {
      pendingConfirmForm = null;
      layer.hidden = true;
    }
  });

  submitButton.addEventListener('click', () => {
    if (!pendingConfirmForm) {
      layer.hidden = true;
      return;
    }

    const targetForm = pendingConfirmForm;
    const methodInput = targetForm.querySelector('input[name="_method"]');

    if (methodInput && methodInput.value) {
      const actionUrl = new URL(targetForm.action, window.location.origin);

      if (!actionUrl.searchParams.has('_method')) {
        actionUrl.searchParams.set('_method', methodInput.value);
        targetForm.action = actionUrl.toString();
      }
    }

    targetForm.dataset.confirmed = 'true';
    rememberScrollPosition(targetForm);
    if (targetForm.matches('[data-loading-form]')) {
      const submitter = targetForm.querySelector('button[type="submit"], input[type="submit"]');
      if (submitter && !submitter.classList.contains('is-loading')) {
        window.sessionStorage.setItem(
          'tm-last-submit',
          JSON.stringify({
            label: submitter.textContent ? submitter.textContent.trim() : submitter.value.trim(),
            successState: submitter.dataset.successState || (submitter.textContent ? submitter.textContent.trim() : submitter.value.trim())
          })
        );
        submitter.classList.add('is-loading');
        submitter.disabled = true;
      }
    }
    pendingConfirmForm = null;
    layer.hidden = true;
    HTMLFormElement.prototype.submit.call(targetForm);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !layer.hidden) {
      pendingConfirmForm = null;
      layer.hidden = true;
    }
  });
}

function rememberScrollPosition(form) {
  const targetKey = resolveFormRestoreTarget(form);

  if (!targetKey) {
    return;
  }

  persistCurrentPageState();
  window.sessionStorage.setItem('tm-next-page-restore', targetKey);
}

function buildPageStateKeyFromUrl(value) {
  try {
    const url = value instanceof URL ? value : new URL(value, window.location.origin);

    if (url.origin !== window.location.origin) {
      return null;
    }

    return `${url.pathname}${url.search}`;
  } catch (error) {
    return null;
  }
}

function resolveFormRestoreTarget(form) {
  const returnInput = form.querySelector('input[name="return_to"]');
  const explicitTarget = returnInput?.value?.trim();

  if (explicitTarget) {
    return buildPageStateKeyFromUrl(explicitTarget);
  }

  if (form.matches('[data-preserve-scroll]')) {
    return getPageStateKey();
  }

  return null;
}

function initLoadingButtons() {
  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement) || !form.matches('form[data-loading-form]')) {
        return;
      }

      if (form.matches('form[data-admin-modal-form]')) {
        return;
      }

      if (event.defaultPrevented || (form.matches('form[data-confirm]') && form.dataset.confirmed !== 'true')) {
        return;
      }

      const submitter = event.submitter || form.querySelector('[type="submit"]');

      if (!submitter || submitter.classList.contains('is-loading')) {
        return;
      }

      rememberScrollPosition(form);
      window.sessionStorage.setItem(
        'tm-last-submit',
        JSON.stringify({
          label: submitter.textContent.trim(),
          successState: submitter.dataset.successState || submitter.textContent.trim()
        })
      );
      submitter.classList.add('is-loading');
      submitter.disabled = true;
    },
    true
  );

  document.addEventListener(
    'submit',
    (event) => {
      const form = event.target;

      if (!(form instanceof HTMLFormElement) || form.matches('form[data-loading-form]')) {
        return;
      }

      if (event.defaultPrevented || (form.matches('form[data-confirm]') && form.dataset.confirmed !== 'true')) {
        return;
      }

      rememberScrollPosition(form);
    },
    true
  );
}

function initSuccessReplay() {
  const savedState = window.sessionStorage.getItem('tm-last-submit');

  if (!savedState) {
    return;
  }

  const hasSuccessFlash = document.querySelector('.flash-success');
  const hasFailureFlash = document.querySelector('.flash-danger');

  if (!hasSuccessFlash || hasFailureFlash) {
    window.sessionStorage.removeItem('tm-last-submit');
    return;
  }

  try {
    const payload = JSON.parse(savedState);
    const buttons = Array.from(
      document.querySelectorAll('button.primary-button, button.ghost-button, input.primary-button, input.ghost-button')
    );
    const target = buttons.find((button) => {
      return button.textContent.trim() === payload.label || button.dataset.successState === payload.successState;
    });

    if (!target) {
      window.sessionStorage.removeItem('tm-last-submit');
      return;
    }

    const originalMarkup = target.innerHTML;
    target.classList.remove('is-loading');
    target.classList.add('is-success');
    target.disabled = true;
    target.innerHTML = `
      <iconify-icon icon="solar:check-circle-bold"></iconify-icon>
      <span>${payload.successState}</span>
    `;

    window.setTimeout(() => {
      target.classList.remove('is-success');
      target.disabled = false;
      target.innerHTML = originalMarkup;
    }, 1400);
  } catch (error) {
    console.error('按钮状态回放失败', error);
  } finally {
    window.sessionStorage.removeItem('tm-last-submit');
  }
}

function initPreservedScrollReplay() {
  const savedState = window.sessionStorage.getItem('tm-preserve-scroll');

  if (!savedState) {
    return;
  }

  try {
    const payload = JSON.parse(savedState);
    if (payload.path !== window.location.pathname || payload.query !== window.location.search) {
      return;
    }

    const restore = () => window.scrollTo({ top: payload.y || 0, behavior: 'auto' });
    window.requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 60);
    });
  } catch (error) {
    console.error('滚动位置恢复失败', error);
  } finally {
    window.sessionStorage.removeItem('tm-preserve-scroll');
  }
}

function getPageStateKey(url = new URL(window.location.href)) {
  return buildPageStateKeyFromUrl(url) || `${window.location.pathname}${window.location.search}`;
}

function persistCurrentPageState() {
  window.sessionStorage.setItem(
    `tm-page-state:${getPageStateKey()}`,
    JSON.stringify({
      y: window.scrollY
    })
  );
}

function restoreSavedPageState() {
  const key = getPageStateKey();
  const navigationEntries = window.performance.getEntriesByType
    ? window.performance.getEntriesByType('navigation')
    : [];
  const navigationType = navigationEntries[0]?.type;
  const pendingTarget = window.sessionStorage.getItem('tm-next-page-restore');
  const shouldRestore = navigationType === 'back_forward' || pendingTarget === key;

  if (!shouldRestore) {
    return;
  }

  const savedState = window.sessionStorage.getItem(`tm-page-state:${key}`);

  if (!savedState) {
    if (pendingTarget === key) {
      window.sessionStorage.removeItem('tm-next-page-restore');
    }
    return;
  }

  try {
    const payload = JSON.parse(savedState);
    const restore = () => window.scrollTo({ top: payload.y || 0, behavior: 'auto' });
    window.requestAnimationFrame(() => {
      restore();
      window.setTimeout(restore, 60);
    });
  } catch (error) {
    console.error('页面状态恢复失败', error);
  } finally {
    if (pendingTarget === key) {
      window.sessionStorage.removeItem('tm-next-page-restore');
    }
  }
}

function initPageStatePreservation() {
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href][data-restore-page-state]');

    if (!link || link.matches('[data-admin-modal]') || link.target === '_blank' || link.hasAttribute('download')) {
      return;
    }

    const targetKey = buildPageStateKeyFromUrl(link.href);

    if (!targetKey) {
      return;
    }

    window.sessionStorage.setItem('tm-next-page-restore', targetKey);
  });

  window.addEventListener('pagehide', persistCurrentPageState);
  window.addEventListener('pageshow', restoreSavedPageState);
}

function initFlashDismiss() {
  document.querySelectorAll('.flash-toast').forEach((item) => {
    window.setTimeout(() => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(-6px)';
      window.setTimeout(() => item.remove(), 260);
    }, 4200);
  });
}

function initProtectedDeletes(root = document) {
  root.querySelectorAll('form[data-confirm]').forEach((form) => {
    if (form.dataset.deleteGuardBound === 'true') {
      return;
    }

    if (/\/admin\/program-plans\/\d+\/modules\/\d+$/.test(form.action)) {
      const card = form.closest('.quick-card');
      const rows = Array.from(card?.querySelectorAll('tbody tr') || []);
      const hasMappedCourses = rows.some((row) => !row.querySelector('td[colspan]'));

      if (hasMappedCourses) {
        const button = form.querySelector('button[type="submit"]');

        if (button) {
          button.disabled = true;
          button.title = '请先删除模块内课程';
          button.classList.add('is-disabled');
          button.textContent = '删除模块';
        }

        form.removeAttribute('data-confirm');
      }
    }

    form.dataset.deleteGuardBound = 'true';
  });
}

function initAuthSwitches(root = document) {
  root.querySelectorAll('[data-auth-switch]').forEach((switcher) => {
    if (switcher.dataset.bound === 'true') {
      return;
    }

    const targetInput = document.getElementById(switcher.dataset.targetInput);
    const isRegisterPanel = switcher.dataset.rolePanel === 'register';
    let switchTimer = null;

    if (!targetInput) {
      return;
    }

    const sync = (triggerRole = null) => {
      let activeButton = null;

      switcher.querySelectorAll('[data-role-value]').forEach((button) => {
        const isActive = button.dataset.roleValue === targetInput.value;
        button.classList.toggle('is-active', isActive);

        if (!isActive) {
          button.classList.remove('is-switching');
          return;
        }

        activeButton = button;
      });

      switcher.dataset.activeRole = targetInput.value;

      if (activeButton && triggerRole) {
        activeButton.classList.remove('is-switching');
        void activeButton.offsetWidth;
        activeButton.classList.add('is-switching');

        if (switchTimer) {
          window.clearTimeout(switchTimer);
        }

        switchTimer = window.setTimeout(() => {
          activeButton.classList.remove('is-switching');
        }, 430);
      }

      if (isRegisterPanel) {
        document.querySelectorAll('[data-role-fields]').forEach((panel) => {
          const isActive = panel.dataset.roleFields === targetInput.value;
          panel.hidden = !isActive;
          panel.classList.toggle('is-active', isActive);

          panel.querySelectorAll('[data-role-required]').forEach((field) => {
            field.required = isActive && field.dataset.roleRequired === targetInput.value;
          });
        });
      }
    };

    switcher.querySelectorAll('[data-role-value]').forEach((button) => {
      button.addEventListener('click', () => {
        targetInput.value = button.dataset.roleValue;
        sync(button.dataset.roleValue);
      });
    });

    switcher.dataset.bound = 'true';
    sync();
  });
}

function applyFilterSearch(wrapper, query = '') {
  const normalizedQuery = query.trim().toLowerCase();
  let visibleCount = 0;

  wrapper.querySelectorAll('.filter-option').forEach((option) => {
    const matches = !normalizedQuery || option.dataset.filterLabel?.includes(normalizedQuery);
    option.hidden = !matches;

    if (matches) {
      visibleCount += 1;
    }
  });

  const emptyState = wrapper.querySelector('.filter-select-empty');

  if (emptyState) {
    emptyState.hidden = visibleCount > 0;
  }
}

function createFilterSearch(wrapper, menu, placeholder) {
  const shell = document.createElement('div');
  shell.className = 'filter-search-shell';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'filter-search-input';
  input.placeholder = placeholder || '搜索选项';
  input.autocomplete = 'off';

  input.addEventListener('input', () => {
    applyFilterSearch(wrapper, input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusFilterOption(wrapper, 0);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const options = getVisibleFilterOptions(wrapper);
      options[options.length - 1]?.focus();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeFilterSelect();
      wrapper.querySelector('.filter-select-trigger')?.focus();
    }
  });

  shell.appendChild(input);
  menu.appendChild(shell);

  const emptyState = document.createElement('div');
  emptyState.className = 'filter-select-empty muted-copy';
  emptyState.textContent = '没有匹配的选项';
  emptyState.hidden = true;
  menu.appendChild(emptyState);

  return input;
}

function createFilterOption(select, option, menu, valueNode, wrapper, index) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'filter-option';
  button.dataset.optionIndex = String(index);
  button.dataset.optionValue = option.value;
  button.dataset.filterLabel = option.textContent.trim().toLowerCase();
  button.classList.toggle('is-selected', option.selected);
  button.innerHTML = `
    <span>${option.textContent}</span>
    <iconify-icon icon="solar:check-read-linear"></iconify-icon>
  `;

  button.addEventListener('click', () => {
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    valueNode.textContent = option.textContent;
    closeFilterSelect();
    wrapper.querySelector('.filter-select-trigger')?.focus();
  });

  button.addEventListener('keydown', (event) => {
    const optionButtons = getVisibleFilterOptions(menu);
    const currentIndex = optionButtons.indexOf(button);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusFilterOption(wrapper, currentIndex + 1);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusFilterOption(wrapper, currentIndex - 1);
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusFilterOption(wrapper, 0);
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusFilterOption(wrapper, optionButtons.length - 1);
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeFilterSelect();
      wrapper.querySelector('.filter-select-trigger')?.focus();
    }
  });

  menu.appendChild(button);
}

function enhanceFilterSelect(select) {
  if (select.dataset.enhanced === 'true') {
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'filter-select';
  wrapper.classList.add(select.closest('.filter-shell') ? 'is-filter-select' : 'is-field-select');
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  select.dataset.enhanced = 'true';
  select.classList.remove('form-select');
  select.classList.add('filter-native-select');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'filter-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const valueNode = document.createElement('span');
  valueNode.textContent = select.options[select.selectedIndex]?.textContent || '请选择';

  const icon = document.createElement('iconify-icon');
  icon.setAttribute('icon', 'solar:alt-arrow-down-linear');

  trigger.appendChild(valueNode);
  trigger.appendChild(icon);

  const menu = document.createElement('div');
  menu.className = 'filter-select-menu';
  menu.hidden = true;
  let searchInput = null;

  const openMenu = (focusIndex = select.selectedIndex) => {
    closeFilterSelect(wrapper);
    wrapper.classList.add('is-open');
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    activeFilterSelect = wrapper;

    if (searchInput) {
      searchInput.value = '';
      applyFilterSearch(wrapper, '');
      window.setTimeout(() => searchInput.focus(), 0);
      return;
    }

    window.setTimeout(() => focusFilterOption(wrapper, focusIndex), 0);
  };

  const rebuildOptions = () => {
    menu.innerHTML = '';
    searchInput = null;
    const options = Array.from(select.options).filter((option) => !option.hidden);
    const searchableOptionCount = options.filter((option) => option.value).length;

    if (searchableOptionCount >= FILTER_SEARCH_THRESHOLD || select.dataset.filterSearch === 'true') {
      searchInput = createFilterSearch(wrapper, menu, select.dataset.searchPlaceholder || '搜索选项');
    }

    options.forEach((option, index) => {
      createFilterOption(select, option, menu, valueNode, wrapper, index);
    });

    applyFilterSearch(wrapper, searchInput?.value || '');
  };

  trigger.addEventListener('click', () => {
    const isOpen = wrapper.classList.contains('is-open');

    if (isOpen) {
      closeFilterSelect();
      return;
    }

    openMenu();
  });

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu(select.selectedIndex);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(Math.max(select.selectedIndex - 1, 0));
    }
  });

  select.addEventListener('change', () => {
    valueNode.textContent = select.options[select.selectedIndex]?.textContent || '请选择';
    Array.from(menu.querySelectorAll('.filter-option')).forEach((child) => {
      child.classList.toggle('is-selected', child.dataset.optionValue === select.value);
    });
  });

  rebuildOptions();
  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
}

function rebuildEnhancedSelect(select) {
  const wrapper = select.closest('.filter-select');
  const menu = wrapper?.querySelector('.filter-select-menu');
  const valueNode = wrapper?.querySelector('.filter-select-trigger span');

  if (!wrapper || !menu || !valueNode) {
    return;
  }

  menu.innerHTML = '';
  let searchInput = null;
  const options = Array.from(select.options).filter((option) => !option.hidden);
  const searchableOptionCount = options.filter((option) => option.value).length;

  if (searchableOptionCount >= FILTER_SEARCH_THRESHOLD || select.dataset.filterSearch === 'true') {
    searchInput = createFilterSearch(wrapper, menu, select.dataset.searchPlaceholder || '搜索选项');
  }

  options.forEach((option, index) => {
    createFilterOption(select, option, menu, valueNode, wrapper, index);
  });

  applyFilterSearch(wrapper, searchInput?.value || '');

  valueNode.textContent = select.options[select.selectedIndex]?.textContent || '请选择';
}

function initFilterEnhancements(root = document) {
  root.querySelectorAll('select.form-select:not([multiple]):not([size])').forEach((select) => {
    enhanceFilterSelect(select);
  });

  if (!filterGlobalsBound) {
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.filter-select')) {
        closeFilterSelect();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeFilterSelect();
      }
    });

    filterGlobalsBound = true;
  }
}

function initMajorDepartmentSync(root = document) {
  root.querySelectorAll('select[data-department-select]').forEach((departmentSelect) => {
    if (departmentSelect.dataset.majorSyncBound === 'true') {
      return;
    }

    const targetId = departmentSelect.dataset.majorTarget;
    const majorSelect = targetId ? root.querySelector(`#${targetId}`) || document.getElementById(targetId) : null;

    if (!(majorSelect instanceof HTMLSelectElement)) {
      return;
    }

    const sync = () => {
      const departmentId = departmentSelect.value;
      let firstVisibleValue = '';
      let selectedStillVisible = false;

      Array.from(majorSelect.options).forEach((option) => {
        const matches = !departmentId || option.dataset.departmentId === departmentId;
        option.hidden = !matches;
        option.disabled = !matches;

        if (matches && !firstVisibleValue) {
          firstVisibleValue = option.value;
        }

        if (matches && option.value === majorSelect.value) {
          selectedStillVisible = true;
        }
      });

      if (!selectedStillVisible && firstVisibleValue) {
        majorSelect.value = firstVisibleValue;
      }

      rebuildEnhancedSelect(majorSelect);
    };

    departmentSelect.addEventListener('change', sync);
    departmentSelect.dataset.majorSyncBound = 'true';
    sync();
  });
}

function initClassMajorSync(root = document) {
  root.querySelectorAll('select[data-major-select]').forEach((majorSelect) => {
    if (majorSelect.dataset.classSyncBound === 'true') {
      return;
    }

    const targetId = majorSelect.dataset.classTarget;
    const classSelect = targetId ? root.querySelector(`#${targetId}`) || document.getElementById(targetId) : null;

    if (!(classSelect instanceof HTMLSelectElement)) {
      return;
    }

    const sync = () => {
      const majorId = majorSelect.value;
      const fallbackOption = Array.from(classSelect.options).find((option) => !option.value) || null;
      let firstVisibleValue = '';
      let selectedStillVisible = classSelect.value === '' ? Boolean(fallbackOption) : false;

      Array.from(classSelect.options).forEach((option) => {
        const matches = !option.value || !majorId || option.dataset.majorId === majorId;
        option.hidden = !matches;
        option.disabled = !matches;

        if (matches && option.value && !firstVisibleValue) {
          firstVisibleValue = option.value;
        }

        if (matches && option.value === classSelect.value) {
          selectedStillVisible = true;
        }
      });

      if (!selectedStillVisible) {
        classSelect.value = fallbackOption ? '' : firstVisibleValue;
      }

      rebuildEnhancedSelect(classSelect);
    };

    majorSelect.addEventListener('change', sync);
    majorSelect.dataset.classSyncBound = 'true';
    sync();
  });
}

function initAdminEditorModal() {
  const modalElement = document.getElementById('admin-editor-modal');

  if (!modalElement || !window.bootstrap) {
    return;
  }

  const titleNode = modalElement.querySelector('#admin-editor-modal-title');
  const bodyNode = modalElement.querySelector('.tm-modal-body');
  const modal = new window.bootstrap.Modal(modalElement);
  let activeTriggerHref = '';

  const renderLoading = (label) => {
    titleNode.textContent = label || '加载中';
    bodyNode.innerHTML = `
      <div class="tm-modal-loading">
        <span class="status-pill is-neutral">正在载入表单</span>
      </div>
    `;
  };

  document.addEventListener('click', async (event) => {
    const trigger = event.target.closest('a[data-admin-modal]');

    if (!trigger) {
      return;
    }

    event.preventDefault();
    activeTriggerHref = trigger.href;
    renderLoading(trigger.textContent.trim() || '编辑窗口');
    modal.show();

    try {
      const response = await fetch(trigger.href, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const redirectTarget = getRedirectTarget(response);

      if (redirectTarget) {
        window.location.href = redirectTarget;
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const content = doc.querySelector('.editor-shell');
      const title = doc.querySelector('.editor-shell .section-title')?.textContent?.trim() || trigger.textContent.trim();

      if (!content) {
        throw new Error('missing modal content');
      }

      titleNode.textContent = title;
      bodyNode.innerHTML = content.outerHTML;
      bodyNode.querySelectorAll('.editor-hero').forEach((node) => node.remove());
      bodyNode.querySelectorAll('.editor-hero-actions').forEach((node) => node.remove());
      bodyNode.querySelectorAll('.form-actions .ghost-button').forEach((button) => {
        if (button.tagName === 'A') {
          button.remove();
        }
      });
      initAuthSwitches(bodyNode);
      initFilterEnhancements(bodyNode);
      initMajorDepartmentSync(bodyNode);
      initClassMajorSync(bodyNode);
      initGeneratedIdentityPreviews(bodyNode);
      initProtectedDeletes(bodyNode);
    } catch (error) {
      titleNode.textContent = '加载失败';
      bodyNode.innerHTML = `
        <div class="tm-modal-error">
          <p class="section-copy mb-0">当前表单暂时无法载入，请稍后重试。</p>
        </div>
      `;
      console.error('弹窗表单载入失败', error);
    }
  });

  bodyNode.addEventListener('submit', async (event) => {
    const form = event.target;

    if (!(form instanceof HTMLFormElement) || !form.matches('form[data-admin-modal-form]')) {
      return;
    }

    event.preventDefault();

    const submitter = event.submitter || form.querySelector('[type="submit"]');

    if (!submitter || submitter.disabled) {
      return;
    }

    submitter.dataset.originalLabel = submitter.dataset.originalLabel || submitter.textContent.trim();
    submitter.disabled = true;
    submitter.textContent = '保存中...';

    rememberScrollPosition(form);

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'text/html',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: buildUrlEncodedBody(form)
      });

      const redirectTarget = getRedirectTarget(response);

      if (redirectTarget) {
        window.location.href = redirectTarget;
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const content = doc.querySelector('.editor-shell');
      const title = doc.querySelector('.editor-shell .section-title')?.textContent?.trim() || '编辑窗口';

      if (!content) {
        throw new Error('missing modal content');
      }

      titleNode.textContent = title;
      bodyNode.innerHTML = content.outerHTML;
      bodyNode.querySelectorAll('.editor-hero').forEach((node) => node.remove());
      bodyNode.querySelectorAll('.editor-hero-actions').forEach((node) => node.remove());
      bodyNode.querySelectorAll('.form-actions .ghost-button').forEach((button) => {
        if (button.tagName === 'A') {
          button.remove();
        }
      });
      initAuthSwitches(bodyNode);
      initFilterEnhancements(bodyNode);
      initMajorDepartmentSync(bodyNode);
      initClassMajorSync(bodyNode);
      initGeneratedIdentityPreviews(bodyNode);
      initProtectedDeletes(bodyNode);
    } catch (error) {
      console.error('弹窗表单提交失败', error);
      const actionBar = bodyNode.querySelector('.form-actions');
      let errorSlot = bodyNode.querySelector('.tm-modal-error-message');

      if (!errorSlot && actionBar) {
        errorSlot = document.createElement('div');
        errorSlot.className = 'tm-modal-error-message copy-danger w-100 text-start';
        actionBar.insertAdjacentElement('beforebegin', errorSlot);
      }

      if (errorSlot) {
        errorSlot.textContent = '保存失败，请检查表单内容后重试。';
      }
      setTransientButtonState(submitter, '保存失败', 'is-danger');
    }
  });

  modalElement.addEventListener('hidden.bs.modal', () => {
    activeTriggerHref = '';
    renderLoading('加载中');
  });
}

function formatCompactNumber(value) {
  if (value === null || typeof value === 'undefined' || value === '') {
    return '--';
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return '--';
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function setTransientButtonState(button, label, className) {
  if (!button) {
    return;
  }

  const originalLabel = button.dataset.originalLabel || button.textContent.trim();
  button.dataset.originalLabel = originalLabel;
  button.textContent = label;
  button.classList.add(className);

  window.setTimeout(() => {
    button.textContent = originalLabel;
    button.classList.remove(className);
    button.disabled = false;
  }, 1200);
}

function buildAssociatedFormData(form) {
  const formData = new FormData(form);

  if (!form.id) {
    return formData;
  }

  document
    .querySelectorAll(`[form="${form.id}"]`)
    .forEach((field) => {
      if (!(field instanceof HTMLElement) || !('name' in field) || !field.name || field.disabled) {
        return;
      }

      if (field instanceof HTMLInputElement) {
        if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) {
          return;
        }

        formData.set(field.name, field.value);
        return;
      }

      if (field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        formData.set(field.name, field.value);
      }
    });

  return formData;
}

function buildUrlEncodedBody(form, options = {}) {
  const formData = buildAssociatedFormData(form);
  const params = new URLSearchParams();
  const excludedNames = new Set(options.excludeNames || []);

  for (const [key, value] of formData.entries()) {
    if (excludedNames.has(key)) {
      continue;
    }

    params.append(key, value == null ? '' : String(value));
  }

  return params;
}

function getRedirectTarget(response) {
  const redirectTarget = response.headers.get('X-Redirect-To');

  if (!redirectTarget) {
    return response.redirected ? response.url : '';
  }

  try {
    return new URL(redirectTarget, window.location.origin).toString();
  } catch (error) {
    return redirectTarget;
  }
}

async function saveAjaxGradeForm(form, submitter, options = {}) {
  const button = submitter || form.querySelector('[type="submit"]');
  const stateNode = form.querySelector('.js-grade-save-state');

  if (button && button.disabled) {
    return false;
  }

  const loadingLabel = options.loadingLabel || '保存中...';
  const successLabel = options.successLabel || '已保存';
  const failureLabel = options.failureLabel || '保存失败';
  if (button) {
    button.dataset.originalLabel = button.dataset.originalLabel || button.textContent.trim();
    button.disabled = true;
    button.textContent = loadingLabel;
  }

  if (stateNode) {
    stateNode.textContent = loadingLabel;
    stateNode.className = 'status-pill is-warning js-grade-save-state';
  }

  try {
    const response = await fetch(form.action, {
      method: form.method || 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: buildUrlEncodedBody(form)
    });

    const payload = await response.json();

    if (!response.ok || !payload.success) {
      throw new Error(payload.message || '成绩保存失败');
    }

    const row = form.closest('tr');
    const totalInput = row?.querySelector('.js-grade-total');
    const pointInput = row?.querySelector('.js-grade-point');
    const failed = Boolean(payload.data?.failed);

    if (totalInput) {
      totalInput.value = formatCompactNumber(payload.data?.totalScore);
      totalInput.classList.toggle('is-danger', failed);
    }

    if (pointInput) {
      pointInput.value = formatCompactNumber(payload.data?.gradePoint);
      pointInput.classList.toggle('is-danger', failed);
    }

    if (row) {
      row.classList.toggle('table-row-danger', failed);
    }

    if (button) {
      setTransientButtonState(button, successLabel, 'is-success');
    }
    if (stateNode) {
      stateNode.textContent = successLabel;
      stateNode.className = 'status-pill is-success js-grade-save-state';
    }
    return true;
  } catch (error) {
    console.error('成绩保存失败', error);
    if (button) {
      setTransientButtonState(button, failureLabel, 'is-danger');
    }
    if (stateNode) {
      stateNode.textContent = failureLabel;
      stateNode.className = 'status-pill is-danger js-grade-save-state';
    }
    return false;
  }
}

function initAjaxGradeForms() {
  const saveTimers = new WeakMap();

  const queueAutoSave = (form) => {
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    const stateNode = form.querySelector('.js-grade-save-state');

    if (stateNode) {
      stateNode.textContent = '待自动保存';
      stateNode.className = 'status-pill is-warning js-grade-save-state';
    }

    if (saveTimers.has(form)) {
      window.clearTimeout(saveTimers.get(form));
    }

    const timerId = window.setTimeout(() => {
      saveAjaxGradeForm(form, null, {
        loadingLabel: '自动保存中',
        successLabel: '已自动保存',
        failureLabel: '保存失败'
      });
    }, 520);

    saveTimers.set(form, timerId);
  };

  document.addEventListener('submit', async (event) => {
    const form = event.target;

    if (!(form instanceof HTMLFormElement) || !form.matches('form[data-ajax-grade-form]')) {
      return;
    }

    event.preventDefault();
    const submitter = event.submitter || form.querySelector('[type="submit"]');
    await saveAjaxGradeForm(form, submitter);
  });

  document.addEventListener('input', (event) => {
    const field = event.target;

    if (!(field instanceof HTMLInputElement) || !['usual_score', 'final_exam_score'].includes(field.name)) {
      return;
    }

    const form = field.form || document.getElementById(field.getAttribute('form') || '');

    if (!(form instanceof HTMLFormElement) || !form.matches('form[data-ajax-grade-form]')) {
      return;
    }

    queueAutoSave(form);
  });

  document.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-bulk-grade-save]');

    if (!trigger) {
      return;
    }

    const scope = trigger.closest('.workspace-panel, .panel') || document;
    const forms = Array.from(scope.querySelectorAll('form[data-ajax-grade-form]'));

    if (!forms.length || trigger.disabled) {
      return;
    }

    trigger.dataset.originalLabel = trigger.dataset.originalLabel || trigger.textContent.trim();
    trigger.disabled = true;
    trigger.textContent = '批量保存中...';

    let successCount = 0;

    for (const form of forms) {
      const rowButton = form.querySelector('[type="submit"]');
      const saved = await saveAjaxGradeForm(form, rowButton, {
        loadingLabel: '保存中...',
        successLabel: '已保存',
        failureLabel: '保存失败'
      });

      if (saved) {
        successCount += 1;
      }
    }

    setTransientButtonState(
      trigger,
      successCount === forms.length ? '全部已保存' : `已保存 ${successCount}/${forms.length}`,
      successCount === forms.length ? 'is-success' : 'is-warning'
    );
  });
}

function initPublishGuard() {
  // 成绩发布由后端直接处理，教师端不再做前端拦截或弹窗提醒。
}

function createProgramMapSvgElement(tagName) {
  return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}

function getProgramMapAnchor(node, side, containerRect) {
  const rect = node.getBoundingClientRect();

  return {
    x: rect.left - containerRect.left + (side === 'right' ? rect.width : 0),
    y: rect.top - containerRect.top + rect.height / 2
  };
}

function appendProgramMapEdge(svg, start, end) {
  if (!svg) {
    return;
  }

  if (Math.abs(start.x - end.x) < 0.5 && Math.abs(start.y - end.y) < 0.5) {
    return;
  }

  const d = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  const glowPath = createProgramMapSvgElement('path');
  glowPath.setAttribute('class', 'program-tree-edge-glow');
  glowPath.setAttribute('d', d);
  svg.appendChild(glowPath);

  const path = createProgramMapSvgElement('path');
  path.setAttribute('class', 'program-tree-edge');
  path.setAttribute('d', d);
  svg.appendChild(path);
}

function drawProgramMapBundle(svg, parentPoint, childPoints, side) {
  if (!childPoints.length) {
    return;
  }

  const pivot =
    side === 'left'
      ? Math.max(...childPoints.map((point) => point.x))
      : Math.min(...childPoints.map((point) => point.x));
  const trunkX = (parentPoint.x + pivot) / 2;
  const yValues = [parentPoint.y, ...childPoints.map((point) => point.y)];
  const trunkStart = { x: trunkX, y: Math.min(...yValues) };
  const trunkEnd = { x: trunkX, y: Math.max(...yValues) };

  appendProgramMapEdge(svg, parentPoint, { x: trunkX, y: parentPoint.y });
  appendProgramMapEdge(svg, trunkStart, trunkEnd);

  childPoints.forEach((point) => {
    appendProgramMapEdge(svg, { x: trunkX, y: point.y }, point);
  });
}

function renderProgramMap(graphElement) {
  const svg = graphElement.querySelector('[data-map-connectors]');
  const rootNode = graphElement.querySelector('[data-map-root]');

  if (!(svg instanceof SVGElement) || !(rootNode instanceof HTMLElement)) {
    return;
  }

  const width = Math.ceil(graphElement.clientWidth);
  const height = Math.ceil(graphElement.clientHeight);

  if (!width || !height) {
    return;
  }

  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));

  const containerRect = graphElement.getBoundingClientRect();

  ['left', 'right'].forEach((side) => {
    const branches = Array.from(graphElement.querySelectorAll(`[data-map-branch][data-map-side="${side}"]`));

    if (!branches.length) {
      return;
    }

    const semesterBundles = branches
      .map((branch) => {
        const semesterNode = branch.querySelector('[data-map-semester-node]');

        if (!(semesterNode instanceof HTMLElement)) {
          return null;
        }

        const incomingSide = side === 'left' ? 'right' : 'left';
        const outgoingSide = side === 'left' ? 'left' : 'right';
        const moduleSide = side === 'left' ? 'right' : 'left';
        const modulePoints = Array.from(branch.querySelectorAll('[data-map-module-node]'))
          .filter((node) => node instanceof HTMLElement)
          .map((node) => getProgramMapAnchor(node, moduleSide, containerRect));

        return {
          incoming: getProgramMapAnchor(semesterNode, incomingSide, containerRect),
          outgoing: getProgramMapAnchor(semesterNode, outgoingSide, containerRect),
          modulePoints
        };
      })
      .filter(Boolean);

    if (!semesterBundles.length) {
      return;
    }

    drawProgramMapBundle(
      svg,
      getProgramMapAnchor(rootNode, side === 'left' ? 'left' : 'right', containerRect),
      semesterBundles.map((bundle) => bundle.incoming),
      side
    );

    semesterBundles.forEach((bundle) => {
      drawProgramMapBundle(svg, bundle.outgoing, bundle.modulePoints, side);
    });
  });
}

function initProgramPlanGraph() {
  document.querySelectorAll('[data-program-map]').forEach((graphElement) => {
    if (graphElement.dataset.programMapBound === 'true') {
      return;
    }

    let frameId = 0;
    const scheduleRender = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        renderProgramMap(graphElement);
      });
    };

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        scheduleRender();
      });

      graphElement.querySelectorAll('[data-map-canvas], [data-map-root], [data-map-branch], [data-map-semester-node], [data-map-module-node]').forEach((node) => {
        resizeObserver.observe(node);
      });
      resizeObserver.observe(graphElement);
    }

    const scrollHost = graphElement.closest('.program-map-scroll');
    if (scrollHost) {
      scrollHost.addEventListener('scroll', scheduleRender, { passive: true });
    }

    window.addEventListener('resize', scheduleRender);
    window.addEventListener('load', scheduleRender, { once: true });

    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleRender).catch(() => {});
    }

    graphElement.dataset.programMapBound = 'true';
    scheduleRender();
  });
}

function initProgramPlanModal() {
  const modalElement = document.getElementById('program-plan-modal');

  if (!modalElement) {
    return;
  }

  const titleNode = modalElement.querySelector('#program-plan-modal-title');
  const summaryNode = modalElement.querySelector('#program-plan-modal-summary');
  const bodyNode = modalElement.querySelector('#program-plan-modal-body');

  if (!titleNode || !summaryNode || !bodyNode) {
    return;
  }

  modalElement.addEventListener('show.bs.modal', (event) => {
    const trigger = event.relatedTarget;
    const payload = trigger?.dataset?.planModuleDetail;

    if (!payload) {
      return;
    }

    try {
      const detail = JSON.parse(decodeURIComponent(payload));
      titleNode.textContent = detail.moduleName || '模块详情';
      summaryNode.innerHTML = `
        <div class="program-summary-grid">
          <article class="metric">
            <span class="metric-label">模块类型</span>
            <div class="metric-value">${detail.moduleType || '--'}</div>
          </article>
          <article class="metric">
            <span class="metric-label">要求学分</span>
            <div class="metric-value">${formatCompactNumber(detail.requiredCredits)}</div>
          </article>
          <article class="metric">
            <span class="metric-label">课程数量</span>
            <div class="metric-value">${formatCompactNumber(detail.courses?.length || 0)}</div>
          </article>
        </div>
      `;

      bodyNode.innerHTML = (detail.courses || [])
        .map((course) => {
          const scoreText = course.score === null ? '--' : formatCompactNumber(course.score);
          const gpaText = course.gradePoint === null ? '--' : formatCompactNumber(course.gradePoint);
          const failed = course.status === '未通过';
          const statusClass =
            course.status === '通过'
              ? 'is-positive'
              : course.status === '已选课'
                ? 'is-warning'
                : failed
                  ? 'is-negative'
                  : 'is-neutral';

          return `
            <tr class="${failed ? 'table-row-danger' : ''}">
              <td><strong>${course.courseName}</strong></td>
              <td>${course.courseCode}</td>
              <td><span class="status-pill ${course.courseType === '必修' ? 'is-positive' : 'is-neutral'}">${course.courseType}</span></td>
              <td>${formatCompactNumber(course.credits)}</td>
              <td>${formatCompactNumber(course.totalHours)}</td>
              <td>第 ${formatCompactNumber(course.recommendedSemester)} 学期</td>
              <td><span class="status-pill ${statusClass}">${course.status}</span></td>
              <td><span class="${failed ? 'copy-danger' : ''}">${scoreText}</span></td>
              <td><span class="${failed ? 'copy-danger' : ''}">${gpaText}</span></td>
            </tr>
          `;
        })
        .join('');
    } catch (error) {
      titleNode.textContent = '模块详情';
      summaryNode.innerHTML = '';
      bodyNode.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="muted-copy">当前模块数据暂时无法读取。</div>
          </td>
        </tr>
      `;
      console.error('培养方案弹窗载入失败', error);
    }
  });
}

function initStudentEvaluationModal() {
  const modalElement = document.getElementById('student-evaluation-modal');

  if (!modalElement) {
    return;
  }

  const titleNode = modalElement.querySelector('#student-evaluation-title');
  const form = modalElement.querySelector('#student-evaluation-form');
  const courseInput = modalElement.querySelector('#student-evaluation-course');
  const teacherInput = modalElement.querySelector('#student-evaluation-teacher');
  const ratingInput = modalElement.querySelector('#student-evaluation-rating');
  const contentInput = modalElement.querySelector('#student-evaluation-content');
  const submitButton = modalElement.querySelector('#student-evaluation-submit');

  if (!titleNode || !form || !courseInput || !teacherInput || !ratingInput || !contentInput || !submitButton) {
    return;
  }

  modalElement.addEventListener('show.bs.modal', (event) => {
    const trigger = event.relatedTarget;

    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    const enrollmentId = trigger.dataset.evaluationId;
    titleNode.textContent = trigger.dataset.evaluationTitle || '教学评价';
    form.action = `/student/evaluations/${enrollmentId || 0}`;
    courseInput.value = trigger.dataset.evaluationCourse || '';
    teacherInput.value = trigger.dataset.evaluationTeacher || '';
    ratingInput.value = trigger.dataset.evaluationRating || '';
    contentInput.value = decodeURIComponent(trigger.dataset.evaluationContent || '');
    submitButton.textContent = trigger.dataset.evaluationSubmit || '提交评价';
    submitButton.dataset.successState = '评价已保存';
  });
}

function initGeneratedIdentityPreviews(root = document) {
  root.querySelectorAll('[data-generated-preview-form]').forEach((form) => {
    if (form.dataset.generatedPreviewBound === 'true') {
      return;
    }

    const endpoint = form.dataset.previewEndpoint;
    const targetInput = form.querySelector('[data-generated-preview-target]');
    const serialInput = form.querySelector('[data-generated-preview-serial]');

    if (!endpoint || !targetInput) {
      return;
    }

    const watchedFields = Array.from(form.querySelectorAll('[data-preview-watch]'));
    let activeRequestId = 0;

    const sync = async () => {
      const params = new URLSearchParams();
      let isComplete = true;

      watchedFields.forEach((field) => {
        const key = field.dataset.previewWatch;
        const value = typeof field.value === 'string' ? field.value.trim() : field.value;

        if (!key) {
          return;
        }

        if (!value) {
          isComplete = false;
          return;
        }

        params.set(key, value);
      });

      if (!isComplete) {
        targetInput.value = '';
        if (serialInput) {
          serialInput.value = '';
        }
        return;
      }

      const requestId = activeRequestId + 1;
      activeRequestId = requestId;

      try {
        const response = await fetch(`${endpoint}?${params.toString()}`, {
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();

        if (requestId !== activeRequestId) {
          return;
        }

        targetInput.value =
          payload.studentNo || payload.teacherNo || payload.courseCode || payload.sectionCode || '';

        if (serialInput) {
          serialInput.value = payload.classSerial || '';
        }
      } catch (error) {
        console.error('编号预览加载失败', error);
        targetInput.value = '';
        if (serialInput) {
          serialInput.value = '';
        }
      }
    };

    watchedFields.forEach((field) => {
      field.addEventListener('input', sync);
      field.addEventListener('change', sync);
    });

    form.dataset.generatedPreviewBound = 'true';
    sync();
  });
}

function initCharts() {
  if (!window.Chart) {
    return;
  }

  window.Chart.defaults.color = '#58635d';
  window.Chart.defaults.font.family = '"Segoe UI Variable Text", "PingFang SC", "Microsoft YaHei UI", sans-serif';
  window.Chart.defaults.borderColor = 'rgba(24, 33, 29, 0.08)';
  window.Chart.defaults.plugins.legend.labels.boxWidth = 12;
  window.Chart.defaults.plugins.legend.labels.usePointStyle = true;

  document.querySelectorAll('[data-chart-config]').forEach((canvas) => {
    if (canvas.dataset.chartBound === 'true') {
      return;
    }

    try {
      const config = JSON.parse(canvas.dataset.chartConfig);
      new window.Chart(canvas, config);
      canvas.dataset.chartBound = 'true';
    } catch (error) {
      console.error('图表初始化失败', error);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initConfirmLayer();
  initProtectedDeletes();
  initLoadingButtons();
  initSuccessReplay();
  initPreservedScrollReplay();
  initPageStatePreservation();
  restoreSavedPageState();
  initFlashDismiss();
  initAuthSwitches();
  initFilterEnhancements();
  initMajorDepartmentSync();
  initClassMajorSync();
  initAdminEditorModal();
  initProgramPlanGraph();
  initProgramPlanModal();
  initStudentEvaluationModal();
  initGeneratedIdentityPreviews();
  initAjaxGradeForms();
  initPublishGuard();
  initCharts();
});
