(() => {
  'use strict';
  const overlay = document.getElementById('howToOverlay');
  const dialog = document.getElementById('howToDialog');
  const closeButton = document.getElementById('howToClose');
  const doneButton = document.getElementById('howToDone');
  const tabs = [...dialog.querySelectorAll('[data-howto-tab]')];
  const pages = [...dialog.querySelectorAll('[data-howto-page]')];
  const triggers = [...document.querySelectorAll('[data-howto-open]')];
  let previousFocus = null;

  function tab(which, focusTab = false) {
    for (const button of tabs) {
      const selected = button.dataset.howtoTab === which;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) button.focus();
    }
    for (const page of pages) page.classList.toggle('hidden', page.dataset.howtoPage !== which);
    document.getElementById('howToContent').scrollTop = 0;
  }
  function openHowTo(event) {
    previousFocus = event?.currentTarget || document.activeElement;
    tab('basics');
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('howto-open');
    closeButton.focus();
  }
  function closeHowTo() {
    if (overlay.classList.contains('hidden')) return;
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('howto-open');
    if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  for (const button of triggers) button.addEventListener('click', openHowTo);
  closeButton.addEventListener('click', closeHowTo);
  doneButton.addEventListener('click', closeHowTo);
  overlay.addEventListener('click', event => { if (event.target === overlay) closeHowTo(); });
  for (const button of tabs) button.addEventListener('click', () => tab(button.dataset.howtoTab));
  dialog.querySelector('.howto-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    let index = tabs.findIndex(item => item.getAttribute('aria-selected') === 'true');
    if (event.key === 'ArrowRight') index = (index+1)%tabs.length;
    else if (event.key === 'ArrowLeft') index = (index-1+tabs.length)%tabs.length;
    else if (event.key === 'Home') index = 0;
    else index = tabs.length - 1;
    tab(tabs[index].dataset.howtoTab, true);
  });
  document.addEventListener('keydown', event => {
    if (overlay.classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHowTo();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled):not(.hidden)')]
      .filter(button => button.getAttribute('aria-selected') !== 'false');
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length-1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });
  window.YSHowTo = {open:openHowTo,close:closeHowTo,tab};
})();