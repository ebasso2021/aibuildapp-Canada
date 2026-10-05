/* Aibuildapp — shared site script. Each page sets window.SITE = { lang, form: {...}, chat: { greeting, reply } } before loading this. */
(function () {
  var SITE = window.SITE || {};
  var header = document.querySelector('.site-header');

  /* Sticky header shadow + mobile menu */
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    var toggle = header.querySelector('.nav-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var open = header.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      header.querySelectorAll('.nav-menu a').forEach(function (a) {
        a.addEventListener('click', function () {
          header.classList.remove('nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  /* Reveal on scroll */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  /* Consultation form -> FormSubmit (sends to the team's inbox) */
  var form = document.getElementById('bookingForm');
  if (form && SITE.form) {
    var T = SITE.form;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('bookingSubmit');
      var status = document.getElementById('bookingStatus');
      var original = btn.textContent;
      btn.disabled = true;
      btn.textContent = T.sending;
      status.textContent = T.sendingStatus;
      status.style.color = '';
      var payload = {
        fullName: form.fullName.value.trim(),
        email: form.email.value.trim(),
        company: form.company.value.trim(),
        need: form.need.value,
        details: form.details.value.trim(),
        _subject: T.subject,
        _template: 'table',
        _captcha: 'false'
      };
      if (form._honey && form._honey.value) { payload._honey = form._honey.value; }
      fetch('https://formsubmit.co/ajax/eleebasso_2003@yahoo.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (r) {
          var ok = r.ok && r.data && (r.data.success === 'true' || r.data.success === true);
          if (!ok) { throw new Error('send failed'); }
          form.reset();
          btn.textContent = T.sent;
          status.textContent = T.thanks;
          status.style.color = 'var(--ok)';
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = original;
          status.innerHTML = T.error + ' <a href="mailto:eleebasso_2003@yahoo.com">eleebasso_2003@yahoo.com</a>.';
          status.style.color = 'var(--err)';
        });
    });
  }

  /* Edward chat */
  var chat = document.getElementById('chat');
  if (chat && SITE.chat) {
    var list = document.getElementById('chatMsgs');
    var chatForm = document.getElementById('chatForm');
    var input = document.getElementById('chatInput');
    var messages = [{ from: 'bot', text: SITE.chat.greeting }];

    var render = function () {
      list.innerHTML = '';
      messages.forEach(function (m) {
        var b = document.createElement('div');
        b.className = 'bubble ' + (m.from === 'user' ? 'user' : 'bot');
        b.textContent = m.text;
        list.appendChild(b);
      });
      list.scrollTop = list.scrollHeight;
    };
    var setOpen = function (open) {
      chat.classList.toggle('open', open);
      document.getElementById('chatOpenBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { chat.classList.add('greet-off'); setTimeout(function () { input.focus(); }, 50); }
    };
    document.getElementById('chatOpenBtn').addEventListener('click', function () { setOpen(!chat.classList.contains('open')); });
    document.getElementById('chatCloseBtn').addEventListener('click', function () { setOpen(false); });
    document.getElementById('chatGreetClose').addEventListener('click', function (e) { e.stopPropagation(); chat.classList.add('greet-off'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { setOpen(false); } });
    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = (input.value || '').trim();
      if (!text) { return; }
      messages.push({ from: 'user', text: text });
      messages.push({ from: 'bot', text: SITE.chat.reply(text) });
      input.value = '';
      render();
    });
    render();
  }
})();
