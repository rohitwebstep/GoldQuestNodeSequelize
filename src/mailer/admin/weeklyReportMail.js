const nodemailer = require("nodemailer");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

async function generateTable(tableHeadings, tableData) {
    const tableHeaders = tableHeadings.map(h => `<th>${h}</th>`).join("");

    let tableRows = "";
    if (Array.isArray(tableData) && tableData.length > 0) {
        tableRows = tableData
            .map((row, index) => {
                const rowHtml = row
                    .map(cell => (cell === null || cell === "null" || cell === "" ? "-" : cell))
                    .join("</td><td>");
                return `<tr><td>${rowHtml}</td></tr>`;
            })
            .join("");
    } else {
        tableRows = `<tr><td colspan="${tableHeadings.length + 1}" class="text-center">No data available</td></tr>`;
    }

    return `
    <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">
      <thead style="background: #f8f9fa;">
        <tr>
          ${tableHeaders}
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  `;
}

async function weeklyReportMail(mailModule, action, tableHeadings, tableData, toArr) {
    try {
        // ✅ Fetch email template
        const emailRows = await sequelize.query(
            "SELECT * FROM emails WHERE module = ? AND action = ? AND status = 1",
            { replacements: [mailModule, action], type: QueryTypes.SELECT }
        );

        if (!emailRows || emailRows.length === 0) throw new Error("Email template not found");
        const email = emailRows[0];

        // ✅ Fetch SMTP credentials
        const smtpRows = await sequelize.query(
            "SELECT * FROM smtp_credentials WHERE module = ? AND action = ? AND status = '1'",
            { replacements: [mailModule, action], type: QueryTypes.SELECT }
        );

        if (!smtpRows || smtpRows.length === 0) throw new Error("SMTP credentials not found");
        const smtp = smtpRows[0];

        console.log(`smtp - `, smtp);

        // ✅ Create transporter
        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure === 1 || smtp.secure === true,
            auth: {
                user: smtp.username,
                pass: smtp.password,
            },
        });

        const table = await generateTable(tableHeadings, tableData);
        let template = email.template.replace(/{{table}}/g, table);

        const recipientList = toArr.map(c => `"${c.name}" <${c.email}>`);

        const info = await transporter.sendMail({
            from: `"${smtp.title}" <${smtp.username}>`,
            to: recipientList.join(", "),
            bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>',
            subject: email.title,
            html: template,
        });

        console.log("✅ Email sent successfully:", info.response);
    } catch (error) {
        console.error("❌ Error sending email:", error.message);
    }
}

module.exports = { weeklyReportMail };
