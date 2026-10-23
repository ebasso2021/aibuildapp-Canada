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

  /* Appointment picker: calendar with date + time slots (inside the contact form) */
  var appt = (function () {
    var A = window.SITE_APPT;
    var box = document.getElementById('fAppt');
    var picker = document.getElementById('apptPicker');
    var cal = document.getElementById('apptCal');
    var slotsEl = document.getElementById('apptSlots');
    var summary = document.getElementById('apptSummary');
    var submitBtn = document.getElementById('bookingSubmit');
    if (!A || !box || !picker || !cal || !slotsEl) { return null; }
    var baseLabel = submitBtn ? submitBtn.textContent : '';
    var nowTz = function () {
      var p = {};
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: A.tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
          .formatToParts(new Date()).forEach(function (x) { if (x.type !== 'literal') { p[x.type] = parseInt(x.value, 10); } });
        if (!p.year) { throw new Error('tz'); }
      } catch (e) {
        var d = new Date(); p = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
      }
      return { y: p.year, m: p.month - 1, d: p.day, mins: (p.hour % 24) * 60 + p.minute };
    };
    var now, today, lastDay, view, sel = { date: null, time: null };
    var sameDay = function (a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); };
    var fmtTime = function (mins) { return new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60).toLocaleTimeString(A.locale, { hour: 'numeric', minute: '2-digit' }); };
    var fmtDate = function (d) { return d.toLocaleDateString(A.locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); };
    var slotsFor = function (d) {
      if (d < today || d > lastDay || A.days.indexOf(d.getDay()) < 0) { return []; }
      var out = [];
      for (var t = A.start * 60; t + A.step <= A.end * 60; t += A.step) {
        if (sameDay(d, today) && t < now.mins + A.leadMins) { continue; }
        out.push(t);
      }
      return out;
    };
    var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (text != null) { n.textContent = text; } return n; };
    var label = function () { return (sel.date && sel.time != null) ? fmtDate(sel.date) + A.at + fmtTime(sel.time) + ' (' + A.tzLabel + ')' : ''; };
    var renderSummary = function () { if (summary) { var v = label(); summary.textContent = v ? A.chosen + ' ' + v : ''; } };
    var renderSlots = function () {
      slotsEl.innerHTML = '';
      slotsEl.appendChild(el('div', 'slots-title', A.times));
      if (!sel.date) { slotsEl.appendChild(el('p', 'slots-empty', A.pickDate)); return; }
      var list = slotsFor(sel.date);
      if (!list.length) { slotsEl.appendChild(el('p', 'slots-empty', A.noSlots)); return; }
      var grid = el('div', 'slot-grid');
      list.forEach(function (t) {
        var b = el('button', 'slot' + (sel.time === t ? ' sel' : ''), fmtTime(t));
        b.type = 'button';
        b.setAttribute('aria-pressed', sel.time === t ? 'true' : 'false');
        b.addEventListener('click', function () { sel.time = t; renderSlots(); renderSummary(); });
        grid.appendChild(b);
      });
      slotsEl.appendChild(grid);
    };
    var renderCal = function () {
      cal.innerHTML = '';
      var head = el('div', 'cal-head');
      var prev = el('button', 'cal-nav', '‹'); prev.type = 'button'; prev.setAttribute('aria-label', A.prev);
      var next = el('button', 'cal-nav', '›'); next.type = 'button'; next.setAttribute('aria-label', A.next);
      prev.disabled = view.getFullYear() * 12 + view.getMonth() <= today.getFullYear() * 12 + today.getMonth();
      next.disabled = view.getFullYear() * 12 + view.getMonth() >= lastDay.getFullYear() * 12 + lastDay.getMonth();
      prev.addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderCal(); });
      next.addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderCal(); });
      head.appendChild(prev);
      var mt = view.toLocaleDateString(A.locale, { month: 'long', year: 'numeric' });
      head.appendChild(el('div', 'cal-title', mt.charAt(0).toUpperCase() + mt.slice(1)));
      head.appendChild(next);
      cal.appendChild(head);
      var grid = el('div', 'cal-grid');
      A.weekdays.forEach(function (w) { grid.appendChild(el('div', 'cal-wd', w)); });
      var first = view.getDay();
      var dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (var i = 0; i < first; i++) { grid.appendChild(el('span', 'cal-pad')); }
      for (var day = 1; day <= dim; day++) {
        (function (d) {
          var b = el('button', 'cal-day', String(d.getDate()));
          b.type = 'button';
          b.setAttribute('aria-label', fmtDate(d));
          if (sameDay(d, today)) { b.className += ' today'; }
          if (sameDay(d, sel.date)) { b.className += ' sel'; b.setAttribute('aria-pressed', 'true'); }
          b.disabled = !slotsFor(d).length;
          b.addEventListener('click', function () { sel.date = d; sel.time = null; renderCal(); renderSlots(); renderSummary(); });
          grid.appendChild(b);
        })(new Date(view.getFullYear(), view.getMonth(), day));
      }
      cal.appendChild(grid);
    };
    var init = function () {
      now = nowTz();
      today = new Date(now.y, now.m, now.d);
      lastDay = new Date(now.y, now.m, now.d + A.maxDays);
      view = new Date(now.y, now.m, 1);
      if (!slotsFor(today).length) {
        for (var k = 1; k <= A.maxDays; k++) { var c = new Date(now.y, now.m, now.d + k); if (slotsFor(c).length) { view = new Date(c.getFullYear(), c.getMonth(), 1); break; } }
      }
      sel = { date: null, time: null };
      renderCal(); renderSlots(); renderSummary();
    };
    var sync = function () {
      picker.hidden = !box.checked;
      if (submitBtn) { submitBtn.textContent = box.checked ? A.submit : baseLabel; }
      if (box.checked) { init(); }
    };
    box.addEventListener('change', sync);
    document.querySelectorAll('[data-book]').forEach(function (a) {
      a.addEventListener('click', function () { if (!box.checked) { box.checked = true; sync(); } });
    });
    return {
      active: function () { return box.checked; },
      value: label,
      start: function () {
        if (!sel.date || sel.time == null) { return ''; }
        var z = function (n) { return (n < 10 ? '0' : '') + n; };
        return sel.date.getFullYear() + '-' + z(sel.date.getMonth() + 1) + '-' + z(sel.date.getDate()) + 'T' + z(Math.floor(sel.time / 60)) + ':' + z(sel.time % 60);
      },
      refresh: function () { init(); },
      focus: function () { var b = cal.querySelector('.cal-day:not(:disabled)'); if (b) { b.focus(); } },
      reset: function () { box.checked = false; sync(); }
    };
  })();

  /* Consultation form -> FormSubmit (sends to the team's inbox) */
  var form = document.getElementById('bookingForm');
  if (form && SITE.form) {
    var T = SITE.form;
    /* Ask for the laptop model when "Technical support" is chosen */
    var laptopField = document.getElementById('laptopField');
    var laptopInput = document.getElementById('fLaptop');
    var needsLaptop = function () {
      var opt = form.need.options[form.need.selectedIndex];
      return !!(opt && opt.hasAttribute('data-ask-laptop'));
    };
    var syncLaptop = function () {
      if (!laptopField || !laptopInput) { return; }
      var show = needsLaptop();
      laptopField.hidden = !show;
      laptopInput.required = show;
      if (!show) { laptopInput.value = ''; }
    };
    form.need.addEventListener('change', function () {
      syncLaptop();
      if (needsLaptop() && laptopInput) { laptopInput.focus(); }
    });
    syncLaptop();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = document.getElementById('bookingSubmit');
      var status = document.getElementById('bookingStatus');
      if (appt && appt.active() && !appt.value()) {
        status.textContent = window.SITE_APPT.missing;
        status.style.color = 'var(--err)';
        appt.focus();
        return;
      }
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
      if (needsLaptop() && laptopInput) { payload.laptopModel = laptopInput.value.trim(); }
      if (appt && appt.active()) { payload.appointment = appt.value(); payload._subject = window.SITE_APPT.subject; }
      if (form._honey && form._honey.value) { payload._honey = form._honey.value; }
      var A = window.SITE_APPT || {};
      var finish = function (msg) {
        form.reset();
        syncLaptop();
        if (appt) { appt.reset(); }
        btn.disabled = true;
        btn.textContent = T.sent;
        status.textContent = msg;
        status.style.color = 'var(--ok)';
      };
      var fail = function () {
        btn.disabled = false;
        btn.textContent = original;
        status.innerHTML = T.error + ' <a href="mailto:eleebasso_2003@yahoo.com">eleebasso_2003@yahoo.com</a>.';
        status.style.color = 'var(--err)';
      };
      var viaFormSubmit = function () {
        return fetch('https://formsubmit.co/ajax/eleebasso_2003@yahoo.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (r) {
            var ok = r.ok && r.data && (r.data.success === 'true' || r.data.success === true);
            if (!ok) { throw new Error('send failed'); }
            finish(T.thanks);
          });
      };
      /* Appointment + booking API configured: the API emails an .ics calendar invite to the visitor and the team.
         If the API is unreachable, fall back to FormSubmit so the request still reaches the team. */
      if (appt && appt.active() && A.api) {
        fetch(A.api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: payload.fullName, email: payload.email, company: payload.company, need: payload.need,
            details: payload.details, laptopModel: payload.laptopModel || '', lang: SITE.lang || 'en',
            start: appt.start(), _honey: payload._honey || ''
          })
        })
          .then(function (res) { return res.json().then(function (d) { return { status: res.status, d: d }; }, function () { return { status: res.status, d: null }; }); })
          .then(function (r) {
            if (r.d && r.d.ok) { finish(r.d.visitorSent === false ? T.thanks : A.emailed.replace('{email}', payload.email)); return; }
            if (r.status === 400 && r.d && /^(closed_|too_)/.test(r.d.error || '')) {
              btn.disabled = false;
              btn.textContent = original;
              status.textContent = A.slotError;
              status.style.color = 'var(--err)';
              appt.refresh();
              appt.focus();
              return;
            }
            throw new Error('api ' + r.status);
          })
          .catch(function () { return viaFormSubmit().catch(fail); });
      } else {
        viaFormSubmit().catch(fail);
      }
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
