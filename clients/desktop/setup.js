window.madarSetup.current().then((origin) => { document.getElementById('origin').value = origin || ''; });
document.getElementById('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('error');
  error.textContent = '';
  const result = await window.madarSetup.save(document.getElementById('origin').value);
  if (!result.ok) error.textContent = result.error;
});
