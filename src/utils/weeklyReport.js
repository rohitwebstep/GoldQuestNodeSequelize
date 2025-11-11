const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const { savePdf } = require("./cloudImageSave");
const clientApplicationModel = require("../models/customer/branch/clientApplicationModel");

function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return "Invalid Date";
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

module.exports = {
    weeklyReport: async (pdfFileName, targetDirectory) => {
        return new Promise((resolve, reject) => {
            clientApplicationModel.weeklyReports(async (err, results) => {
                if (err) {
                    console.error("Database error:", err);
                    return reject(err);
                }

                const { clientApplications, tableHeadings, serviceHeadings } = results;

                try {
                    // Initialize jsPDF
                    const doc = new jsPDF();
                    doc.setFontSize(16);
                    doc.text("Weekly Application Report", 14, 15);

                    // Add date info
                    const reportDate = new Date().toLocaleString();
                    doc.setFontSize(10);
                    doc.text(`Generated on: ${reportDate}`, 14, 22);

                    let count = 1;
                    // Format data for table
                    const tableData = clientApplications.map((clientApplication, i) => {

                        console.log("clientApplication.services", clientApplication.services);

                        const clientApplicationServiceStatus = serviceHeadings.map((heading, index) => {
                            // Find matching service by heading
                            const match = Array.isArray(clientApplication.services)
                                ? clientApplication.services.find(s => s.heading === heading)
                                : null;

                            const status = match ? match.status : '';

                            console.log(`Service #${index + 1}: ${heading} → Status: ${status || '(empty)'}`);

                            return status;
                        });

                        console.log("✅ Final clientApplicationServiceStatus:", clientApplicationServiceStatus);


                        return [
                            count++,
                            clientApplication.applicationId || '',
                            clientApplication.clientCode || '',
                            clientApplication.createdAt || '',
                            ...clientApplicationServiceStatus,
                            clientApplication.overallStatus || '',
                            clientApplication.reportDate || '',
                            clientApplication.firstInsufficiencyMarks || '',
                            clientApplication.firstInsuffDate || '',
                            clientApplication.firstInsuffReopenedDate || '',
                            clientApplication.secondInsufficiencyMarks || '',
                            clientApplication.secondInsuffDate || '',
                            clientApplication.secondInsuffReopenedDate || '',
                            clientApplication.thirdInsufficiencyMarks || '',
                            clientApplication.thirdInsuffDate || '',
                            clientApplication.thirdInsuffReopenedDate || '',
                            clientApplication.delayReason || '',
                        ];
                    });

                    console.log(`tableData - `, tableData);


                    // Add table
                    doc.autoTable({
                        startY: 30,
                        head: [tableHeadings],
                        body: tableData,
                        styles: { fontSize: 10 },
                    });

                    doc.save(`123.pdf`);


                    // Save PDF to cloud
                    // const pdfPathCloud = await savePdf(doc, pdfFileName, targetDirectory);

                    console.log("✅ Weekly report generated:", pdfPathCloud);
                    resolve(`Hello`);
                } catch (error) {
                    console.error("PDF generation error:", error);
                    reject(error);
                }
            });
        });
    },
};
