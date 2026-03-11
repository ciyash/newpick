import PDFDocument from "pdfkit";

export const generateTransactionsPDF = async (transactions, year) => {
  const doc = new PDFDocument({ margin: 40 });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(`PICK2WIN Wallet Transactions ${year}`, { align: "center" });
    doc.moveDown();

    transactions.forEach((txn, i) => {
      doc
        .fontSize(12)
        .text(
          `${i + 1}. ID: ${txn.id} | Wallet: ${txn.walletType} | Type: ${txn.transactionType} | Amount: ${txn.amount} | Remark: ${txn.remark || "-"} | Date: ${new Date(txn.date).toLocaleString()}`
        );
      doc.moveDown(0.5);
    });

    doc.end();
  });
};