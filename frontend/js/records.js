requireAuth();

const tableBody = document.getElementById("records-table-body");
const emptyState = document.getElementById("empty-state");
const totalIncomeEl = document.getElementById("total-income");
const totalExpensesEl = document.getElementById("total-expenses");
const netProfitEl = document.getElementById("net-profit");
const recordCountEl = document.getElementById("record-count");
const loadMoreBtn = document.getElementById("load-more-btn");

const PAGE_SIZE = 20;
let currentOffset = 0;
let allTransactions = [];

const categoryIcons = {
  sales: "store",
  inventory: "shopping_bag",
  transport: "local_shipping",
  fuel: "local_gas_station",
  utilities: "bolt",
  supplies: "shopping_bag",
  meals: "restaurant",
  services: "handshake",
};

function iconForCategory(category) {
  return categoryIcons[(category || "").toLowerCase()] || "receipt_long";
}

function formatCurrency(amount) {
  return `₦${Number(amount).toLocaleString()}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function renderRow(tx) {
  const isIncome = tx.type === "income";
  const row = document.createElement("tr");
  row.className = isIncome
    ? "hover:bg-primary-container/10 transition-colors"
    : "hover:bg-error-container/20 transition-colors";

  row.innerHTML = `
    <td class="px-8 py-6 font-body-md text-body-md text-on-surface">${formatDate(tx.date)}</td>
    <td class="px-8 py-6">
      <span class="px-3 py-1 rounded-full font-label-sm text-label-sm ${
        isIncome ? "bg-primary-container/20 text-primary" : "bg-error-container text-on-error-container"
      }">${isIncome ? "Income" : "Expense"}</span>
    </td>
    <td class="px-8 py-6">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface-variant">
          <span class="material-symbols-outlined text-sm">${iconForCategory(tx.category)}</span>
        </div>
        <span class="font-body-md text-body-md text-on-surface capitalize">${tx.category || "Other"}</span>
      </div>
    </td>
    <td class="px-8 py-6 font-body-md text-body-md text-on-surface-variant">${tx.description || "—"}</td>
    <td class="px-8 py-6 font-headline-sm text-headline-sm text-right ${isIncome ? "text-primary" : "text-error"}">
      ${isIncome ? "+" : "-"}${formatCurrency(tx.amount)}
    </td>
  `;
  return row;
}

function renderTotals(transactions) {
  const income = transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const expenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const net = income - expenses;

  if (totalIncomeEl) totalIncomeEl.innerText = formatCurrency(income);
  if (totalExpensesEl) totalExpensesEl.innerText = formatCurrency(expenses);
  if (netProfitEl) netProfitEl.innerText = formatCurrency(net);
}

function renderTable() {
  if (!tableBody) return;
  tableBody.innerHTML = "";

  if (allTransactions.length === 0) {
    if (emptyState) emptyState.classList.remove("hidden");
    if (recordCountEl) recordCountEl.innerText = "Showing 0 records";
    return;
  }

  if (emptyState) emptyState.classList.add("hidden");

  allTransactions.forEach((tx) => tableBody.appendChild(renderRow(tx)));

  if (recordCountEl) {
    recordCountEl.innerText = `Showing ${allTransactions.length} record${allTransactions.length === 1 ? "" : "s"}`;
  }
}

async function loadTransactions(append = false) {
  try {
    const data = await apiFetch(`/transactions?limit=${PAGE_SIZE}&offset=${currentOffset}`, {
      method: "GET",
    });

    const transactions = data.transactions || [];

    if (append) {
      allTransactions = allTransactions.concat(transactions);
    } else {
      allTransactions = transactions;
    }

    renderTable();
    renderTotals(allTransactions);

    // Hide "Load More" if fewer than a full page came back
    if (loadMoreBtn) {
      loadMoreBtn.classList.toggle("hidden", transactions.length < PAGE_SIZE);
    }
  } catch (err) {
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5" class="px-8 py-6 text-center text-error">Couldn't load records: ${err.message}</td></tr>`;
    }
  }
}

if (loadMoreBtn) {
  loadMoreBtn.addEventListener("click", () => {
    currentOffset += PAGE_SIZE;
    loadTransactions(true);
  });
}

// Export PDF
const exportPdfBtn = document.getElementById("export-pdf-btn");
if (exportPdfBtn) {
  exportPdfBtn.addEventListener("click", () => {
    if (allTransactions.length === 0) {
      alert("No records to export yet.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const businessName = getBusinessName();
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    // Header
    doc.setFontSize(18);
    doc.setTextColor(49, 99, 66); // primary green
    doc.text("KudiVoice", 14, 18);

    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    doc.text(`${businessName} — Transaction Records`, 14, 26);
    doc.text(`Generated on ${today}`, 14, 32);

    // Totals summary
    const income = allTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expenses = allTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const net = income - expenses;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Income: ${formatCurrency(income)}`, 14, 42);
    doc.text(`Total Expenses: ${formatCurrency(expenses)}`, 14, 48);
    doc.text(`Net Profit: ${formatCurrency(net)}`, 14, 54);

    // Table
    const rows = allTransactions.map((tx) => [
      formatDate(tx.date),
      tx.type === "income" ? "Income" : "Expense",
      tx.category || "Other",
      tx.description || "—",
      `${tx.type === "income" ? "+" : "-"}${formatCurrency(tx.amount)}`,
    ]);

    doc.autoTable({
      startY: 62,
      head: [["Date", "Type", "Category", "Description", "Amount"]],
      body: rows,
      headStyles: { fillColor: [49, 99, 66] },
      styles: { fontSize: 9 },
    });

    doc.save(`gemledger-records-${new Date().toISOString().slice(0, 10)}.pdf`);
  });
}

loadTransactions();