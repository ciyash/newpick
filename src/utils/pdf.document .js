import PDFDocument from "pdfkit";

export const generateTransactionsPDF = (transactions, year) => {

  return new Promise((resolve) => {

    const doc = new PDFDocument();
    const buffers = [];

    doc.on("data", buffers.push.bind(buffers));

    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      resolve(pdfData);
    });

    doc.fontSize(18).text(`PICK2WIN Wallet Transactions ${year}`, {
      align: "center"
    });

    doc.moveDown();

    transactions.forEach((txn) => {

      doc
        .fontSize(12)
        .text(
          `ID: ${txn.id} | Wallet: ${txn.walletType} | Type: ${txn.transactionType} | Amount: ${txn.amount} | Remark: ${txn.remark} | Date: ${txn.date}`
        );

      doc.moveDown();

    });

    doc.end();

  });

};