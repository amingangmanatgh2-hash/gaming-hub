import { $, api, fa, toast } from '/common.js';

const form = $('#setupForm');
let step = 1;
function showStep(next) {
  step = next;
  document.querySelectorAll('.setup-step').forEach((section) => { section.hidden = Number(section.dataset.step) !== next; });
  document.querySelectorAll('[data-step-dot]').forEach((dot) => { dot.classList.toggle('active', Number(dot.dataset.stepDot) <= next); });
  $('#stepCounter').textContent = `گام ${fa(next)} از ۳`;
  if (next === 3) {
    const review = $('#setupReview');
    review.replaceChildren();
    for (const [label, value] of [['فروشگاه', form.elements.siteName.value.trim()], ['نرخ دلار', `${fa(Number(form.elements.usdToToman.value))} تومان`], ['ربات تلگرام', form.elements.botToken.value.trim() ? 'برای ثبت تنظیم شد' : 'فعلاً بدون ربات'], ['رمز مدیریت', '●●●●●●●●']]) {
      const row = document.createElement('div');
      const key = document.createElement('span'); key.textContent = label;
      const text = document.createElement('strong'); text.textContent = value;
      row.append(key, text); review.append(row);
    }
  }
}
function validStep(n) {
  const section = document.querySelector(`.setup-step[data-step="${n}"]`);
  for (const input of section.querySelectorAll('input[required]')) if (!input.reportValidity()) return false;
  if (n === 1 && form.elements.password.value !== form.elements.passwordConfirm.value) {
    form.elements.passwordConfirm.setCustomValidity('تکرار رمز با رمز مدیر یکسان نیست.');
    form.elements.passwordConfirm.reportValidity();
    return false;
  }
  form.elements.passwordConfirm.setCustomValidity('');
  return true;
}
form.elements.passwordConfirm.addEventListener('input', () => form.elements.passwordConfirm.setCustomValidity(''));
document.querySelectorAll('.next-step').forEach((button) => button.addEventListener('click', () => { if (validStep(step)) showStep(Number(button.dataset.next)); }));
document.querySelectorAll('.prev-step').forEach((button) => button.addEventListener('click', () => showStep(Number(button.dataset.prev))));
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!validStep(1) || !validStep(2)) return;
  const submit = $('#setupSubmit');
  submit.disabled = true;
  $('#setupError').textContent = '';
  try {
    await api('/setup', { method: 'POST', data: {
      setupKey: form.elements.setupKey.value,
      password: form.elements.password.value,
      botToken: form.elements.botToken.value.trim(),
      siteName: form.elements.siteName.value.trim(),
      usdToToman: Number(form.elements.usdToToman.value),
    } });
    // Neither setup key, password nor Telegram token is persisted in the browser.
    form.reset();
    window.location.replace('/panel');
  } catch (e) { $('#setupError').textContent = e.message; submit.disabled = false; }
});
(async () => {
  try {
    const status = await api('/setup/status');
    if (status.initialized) {
      $('#prereq').textContent = 'فروشگاه قبلاً نصب شده است. برای تغییر تنظیمات به پنل مدیریت بروید.';
      $('#setupForm').hidden = true;
      return;
    }
    $('#prereq').textContent = status.setupKeyConfigured
      ? `کلید نصب آماده است. ${status.botEncryptionConfigured ? 'رمزنگاری ربات هم آماده است.' : 'برای وارد کردن توکن ربات، APP_SECRET را تنظیم کنید.'}`
      : 'SETUP_KEY هنوز تنظیم نشده است؛ ابتدا Secret را روی Worker ثبت و سپس این صفحه را تازه‌سازی کنید.';
    $('#prereq').classList.toggle('warn', !status.setupKeyConfigured);
  } catch (e) { $('#prereq').textContent = e.message; $('#prereq').classList.add('warn'); toast(e.message); }
})();
