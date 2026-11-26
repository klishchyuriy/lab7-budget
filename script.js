const STORAGE_KEY = 'budget-operations';
const NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json';
const CURRENCIES = ['USD', 'EUR', 'PLN'];

let categories = [];
let operations = [];
let rates = { UAH: 1 };
let ratesReady;

const form = document.getElementById('op-form');
const periodInput = document.getElementById('period');
const categorySelect = document.getElementById('category');
const filterCategory = document.getElementById('filter-category');
const opsBody = document.getElementById('ops');
const clearBtn = document.getElementById('clear');

// Допоміжні функції
function money(value) {
  return value.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₴';
}

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function findCategory(id) {
  return categories.find(c => c.id === id) || { name: id, color: '#999' };
}

// Довідник категорій з JSON-файлу
async function loadCategories() {
  const response = await fetch('categories.json');
  if (!response.ok) throw new Error('Не вдалося завантажити categories.json');
  categories = await response.json();

  categories.forEach(c => {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.name;
    filterCategory.appendChild(option);
  });
  fillCategorySelect();
}

function fillCategorySelect() {
  const type = form.elements.type.value;
  categorySelect.innerHTML = '';
  categories
    .filter(c => c.type === type)
    .forEach(c => categorySelect.add(new Option(c.name, c.id)));
}

// Курси НБУ
async function loadRates() {
  const box = document.getElementById('rates');
  try {
    const response = await fetch(NBU_URL);
    const data = await response.json();
    const list = data.filter(item => CURRENCIES.includes(item.cc));
    list.forEach(item => { rates[item.cc] = item.rate; });

    box.innerHTML = 'Курс НБУ на ' + list[0].exchangedate + ': ' +
      list.map(item => '<b>' + item.cc + ' ' + item.rate.toFixed(2) + '</b>').join('');
  } catch (error) {
    box.textContent = 'Курси НБУ зараз недоступні, операції у валюті додати не вийде.';
  }
  updatePreview();
}

// localStorage
function loadOperations() {
  try {
    operations = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (error) {
    operations = [];
  }
}

function saveOperations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(operations));
}

function createOperation(data) {
  const amount = Number(data.amount);
  return {
    id: Date.now() + Math.random(),
    type: data.type,
    amount: amount,
    currency: data.currency,
    rate: rates[data.currency],
    amountUAH: Math.round(amount * rates[data.currency] * 100) / 100,
    category: data.category,
    date: data.date,
    comment: (data.comment || '').trim()
  };
}

// Валідація форми
function validate(data) {
  const errors = {};
  const amount = Number(data.amount);

  if (data.amount === '' || isNaN(amount)) errors.amount = 'Вкажіть суму';
  else if (amount <= 0) errors.amount = 'Сума має бути більшою за нуль';
  else if (amount > 1000000) errors.amount = 'Занадто велика сума';
  else if (!rates[data.currency]) errors.amount = 'Немає курсу для ' + data.currency;

  if (!data.category) errors.category = 'Оберіть категорію';

  if (!data.date) errors.date = 'Вкажіть дату';
  else if (data.date > today()) errors.date = 'Дата не може бути з майбутнього';

  return errors;
}

function showErrors(errors) {
  form.querySelectorAll('.error-msg').forEach(el => {
    const name = el.dataset.for;
    el.textContent = errors[name] || '';
    form.elements[name].classList.toggle('invalid', Boolean(errors[name]));
  });
}

function updatePreview() {
  const preview = document.getElementById('preview');
  const amount = Number(form.elements.amount.value);
  const currency = form.elements.currency.value;
  if (currency !== 'UAH' && amount > 0 && rates[currency]) {
    preview.textContent = '≈ ' + money(amount * rates[currency]) + ' за курсом ' + rates[currency].toFixed(2);
  } else {
    preview.textContent = '';
  }
}

// Відбір і сортування операцій
function inPeriod(op) {
  return op.date.slice(0, 7) === periodInput.value;
}

function getVisibleOperations() {
  const search = document.getElementById('search').value.trim().toLowerCase();
  const type = document.getElementById('filter-type').value;
  const category = filterCategory.value;
  const sort = document.getElementById('sort').value;

  const list = operations
    .filter(inPeriod)
    .filter(op => type === 'all' || op.type === type)
    .filter(op => category === 'all' || op.category === category)
    .filter(op => op.comment.toLowerCase().includes(search));

  const sorters = {
    'date-desc': (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
    'date-asc': (a, b) => a.date.localeCompare(b.date) || a.id - b.id,
    'sum-desc': (a, b) => b.amountUAH - a.amountUAH,
    'sum-asc': (a, b) => a.amountUAH - b.amountUAH
  };
  return list.sort(sorters[sort]);
}

function getTotals(list) {
  return list.reduce((acc, op) => {
    acc[op.type] += op.amountUAH;
    return acc;
  }, { income: 0, expense: 0 });
}

// Відображення
function renderSummary() {
  const monthOps = operations.filter(inPeriod);
  const totals = getTotals(monthOps);
  const balance = totals.income - totals.expense;

  const balanceEl = document.getElementById('balance');
  balanceEl.textContent = money(balance);
  balanceEl.classList.toggle('negative', balance < 0);
  document.getElementById('income-total').textContent = money(totals.income);
  document.getElementById('expense-total').textContent = money(totals.expense);
  document.getElementById('count').textContent = monthOps.length;
}

function renderChart() {
  const chart = document.getElementById('chart');
  const monthOps = operations.filter(op => inPeriod(op) && op.type === 'expense');
  chart.innerHTML = '';

  categories
    .filter(c => c.type === 'expense')
    .map(c => ({
      ...c,
      spent: monthOps.filter(op => op.category === c.id).reduce((sum, op) => sum + op.amountUAH, 0)
    }))
    .sort((a, b) => b.spent - a.spent)
    .forEach(c => {
      const percent = Math.min(c.spent / c.limit * 100, 100);
      const row = document.createElement('div');
      row.className = 'bar-row' + (c.spent > c.limit ? ' over' : '');
      row.innerHTML =
        '<span class="bar-name"><i class="dot" style="background:' + c.color + '"></i>' + c.name + '</span>' +
        '<div class="bar"><span style="width:0;background:' + c.color + '"></span></div>' +
        '<span class="bar-value">' + Math.round(c.spent) + ' / ' + c.limit + ' ₴</span>';
      row.title = c.spent > c.limit ? 'Ліміт перевищено' : 'Використано ' + Math.round(c.spent / c.limit * 100) + '% ліміту';
      chart.appendChild(row);
      requestAnimationFrame(() => { row.querySelector('.bar span').style.width = percent + '%'; });
    });

  renderInsight(monthOps);
}

function renderInsight(expenses) {
  const box = document.getElementById('insight');
  const total = expenses.reduce((sum, op) => sum + op.amountUAH, 0);
  if (total === 0) {
    box.textContent = 'Витрат за цей місяць ще немає.';
    return;
  }

  const byCategory = categories
    .filter(c => c.type === 'expense')
    .map(c => ({ ...c, spent: expenses.filter(op => op.category === c.id).reduce((sum, op) => sum + op.amountUAH, 0) }));
  const biggest = byCategory.reduce((max, c) => (c.spent > max.spent ? c : max));
  const over = byCategory.filter(c => c.spent > c.limit).map(c => c.name.toLowerCase());

  let text = 'Найбільше пішло на категорію «' + biggest.name + '»: ' + Math.round(biggest.spent / total * 100) + '% усіх витрат.';
  text += over.length ? ' Ліміт перевищено: ' + over.join(', ') + '.' : ' Усі ліміти дотримано.';
  box.textContent = text;
}

function renderTable(newId) {
  const list = getVisibleOperations();
  opsBody.innerHTML = '';

  list.forEach(op => {
    const cat = findCategory(op.category);
    const sign = op.type === 'income' ? '+' : '−';
    const tr = document.createElement('tr');
    if (op.id === newId) tr.className = 'new';

    const cells = [
      new Date(op.date).toLocaleDateString('uk-UA'),
      '<span class="tag"><i class="dot" style="background:' + cat.color + '"></i>' + cat.name + '</span>',
      '',
      sign + ' ' + op.amount.toLocaleString('uk-UA', { minimumFractionDigits: 2 }) + ' ' + op.currency,
      '<span class="' + (op.type === 'income' ? 'plus' : 'minus') + '">' + sign + ' ' + money(op.amountUAH) + '</span>',
      '<button class="del" data-id="' + op.id + '" aria-label="Видалити операцію" title="Видалити">×</button>'
    ];
    cells.forEach((html, i) => {
      const td = document.createElement('td');
      if (i === 3 || i === 4) td.className = 'num';
      if (i === 2) td.textContent = op.comment || '—';
      else td.innerHTML = html;
      tr.appendChild(td);
    });
    opsBody.appendChild(tr);
  });

  const nothingInMonth = operations.filter(inPeriod).length === 0;
  document.getElementById('empty').hidden = !nothingInMonth;
  document.querySelector('.table-wrap').hidden = nothingInMonth;
}

function render(newId) {
  renderSummary();
  renderChart();
  renderTable(newId);
}

// Експорт у CSV
function exportCSV() {
  const header = ['Дата', 'Тип', 'Категорія', 'Коментар', 'Сума', 'Валюта', 'Курс', 'Сума в UAH'];
  const rows = getVisibleOperations().map(op => [
    op.date,
    op.type === 'income' ? 'Дохід' : 'Витрата',
    findCategory(op.category).name,
    '"' + op.comment.replace(/"/g, '""') + '"',
    op.amount,
    op.currency,
    op.rate,
    op.amountUAH
  ]);
  const csv = [header, ...rows].map(row => row.join(';')).join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'budget-' + periodInput.value + '.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

// Події
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const errors = validate(data);
  showErrors(errors);
  if (Object.keys(errors).length > 0) return;

  const op = createOperation(data);
  operations.push(op);
  saveOperations();

  periodInput.value = op.date.slice(0, 7);
  form.elements.amount.value = '';
  form.elements.comment.value = '';
  updatePreview();
  render(op.id);
});

form.addEventListener('change', event => {
  if (event.target.name === 'type') fillCategorySelect();
  if (event.target.name === 'currency') updatePreview();
});
form.elements.amount.addEventListener('input', updatePreview);

['search', 'filter-type', 'filter-category', 'sort'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => renderTable());
});
periodInput.addEventListener('change', () => render());

opsBody.addEventListener('click', event => {
  const button = event.target.closest('.del');
  if (!button) return;
  operations = operations.filter(op => String(op.id) !== button.dataset.id);
  saveOperations();
  render();
});

document.getElementById('export').addEventListener('click', exportCSV);

// Очищення з підтвердженням другим натисканням
let clearTimer;
clearBtn.addEventListener('click', () => {
  if (!clearBtn.classList.contains('confirm')) {
    clearBtn.classList.add('confirm');
    clearBtn.textContent = 'Точно видалити все?';
    clearTimer = setTimeout(() => {
      clearBtn.classList.remove('confirm');
      clearBtn.textContent = 'Очистити все';
    }, 3000);
    return;
  }
  clearTimeout(clearTimer);
  operations = [];
  saveOperations();
  clearBtn.classList.remove('confirm');
  clearBtn.textContent = 'Очистити все';
  render();
});

document.getElementById('demo').addEventListener('click', async () => {
  const response = await fetch('demo.json');
  const demo = await response.json();
  await ratesReady;
  operations = demo.filter(item => rates[item.currency]).map(createOperation);
  saveOperations();
  periodInput.value = demo[demo.length - 1].date.slice(0, 7);
  render();
});

// Запуск
async function init() {
  periodInput.value = today().slice(0, 7);
  form.elements.date.value = today();
  form.elements.date.max = today();
  loadOperations();
  try {
    await loadCategories();
  } catch (error) {
    document.getElementById('chart').textContent = error.message;
  }
  render();
  ratesReady = loadRates();
}

init();
