const origin = document.getElementById('origin');
const status = document.getElementById('status');
const error = document.getElementById('error');
window.madarSetup.current().then((value) => { origin.value = value || ''; });
window.madarSetup.onStatus((message) => { status.textContent = message; });
document.getElementById('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  const result = await window.madarSetup.save(origin.value);
  if (!result.ok) error.textContent = result.error;
});
document.getElementById('retry').addEventListener('click', () => {
  error.textContent = '';
  window.madarSetup.retry();
});
