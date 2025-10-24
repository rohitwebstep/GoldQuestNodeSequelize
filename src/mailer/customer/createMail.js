const nodemailer = require("nodemailer");
const { sequelize } = require("../../config/db"); // Import the existing MySQL connection
const { QueryTypes } = require("sequelize");

// Function to generate an HTML table from branch details
const generateTable = (branches, password) => {
  let table =
    '<table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse;">';
  table +=
    "<tr><th>Sr. No.</th><th>Email</th><th>Name</th><th>Password</th></tr>";

  branches.forEach((branch, index) => {
    table += `<tr>
                <td>${index + 1}</td>
                <td>${branch.email}</td>
                <td>${branch.name}</td>
                <td>${password}</td>
              </tr>`;
  });

  table += "</table>";
  return table;
};

// Function to send email
async function createMail(
  mailModule,
  action,
  client_name,
  branches,
  is_head,
  customerData,
  ccArray,
  password,
  appCustomerLoginHost
) {
  
  if (!appCustomerLoginHost) {
    appCustomerLoginHost = "www.example.com";
  }
  try {
    // Fetch email template
    const [emailRows] = await sequelize.query("SELECT * FROM emails WHERE module = ? AND action = ? AND status = 1", {
      replacements: [mailModule, action],
      type: QueryTypes.SELECT,
    });
    if (emailRows.length === 0) throw new Error("Email template not found");
    const email = emailRows;  // Assign the first (and only) element to email

    // Fetch SMTP credentials
    const [smtpRows] = await sequelize.query("SELECT * FROM smtp_credentials WHERE module = ? AND action = ? AND status = '1'", {
      replacements: [mailModule, action],
      type: QueryTypes.SELECT,
    });
    if (smtpRows.length === 0) throw new Error("SMTP credentials not found");
    const smtp = smtpRows;  // Assign the first (and only) element to smtp

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure, // true for 465, false for other ports
      auth: {
        user: smtp.username,
        pass: smtp.password,
      },
    });

    // Generate the HTML table from branch details
    const table = generateTable(branches, password);

    console.log(`table - `, table);
    // return;

    // Replace placeholders in the email template
    let template = email.template
      .replace(/{{dynamic_name}}/g, client_name)
      .replace(/{{table}}/g, table)
      .replace(/{{appCustomerLoginHost}}/g, appCustomerLoginHost);

    // Prepare recipient list based on whether the branch is a head branch
    let recipientList;
    if (is_head === 1) {
      recipientList =
        customerData.length > 0
          ? customerData.map(
            (customer) => `"${customer.name}" <${customer.email}>`
          )
          : [];
    } else {
      // If not a head branch, only include the specific branches
      recipientList =
        branches.length > 0
          ? branches.map((branch) => `"${branch.name}" <${branch.email}>`)
          : [];
    }

    // Prepare CC list
    const ccList = [
      '"GoldQuest Onboarding" <onboarding@goldquestglobal.in>',
      ...ccArray.map((recipient) => `"${recipient.name}" <${recipient.email}>`),
    ];

    // Send email to the prepared recipient list
    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: recipientList.join(", "), // Join the recipient list into a string
      cc: ccList.join(", "),
      bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>',
      subject: email.title,
      html: template,
    });

    console.log("Email sent successfully:", info.response);
  } catch (error) {
    console.error("Error sending email:", error.message);
  } finally {
  }
}

module.exports = { createMail };
