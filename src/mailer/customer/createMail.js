const nodemailer = require("nodemailer");
const { startConnection, connectionRelease } = require("../../config/db"); // Import the existing MySQL connection

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
  module,
  action,
  client_name,
  branches,
  is_head,
  customerData,
  ccArray,
  password,
  appCustomerLoginHost
) {
  let connection;
  if (!appCustomerLoginHost) {
    appCustomerLoginHost = "www.example.com";
  }
  try {
    // Use a promise to handle the callback-based startConnection function
    connection = await new Promise((resolve, reject) => {
      startConnection((err, conn) => {
        if (err) {
          return reject(err);
        }
        resolve(conn);
      });
    });

    // Fetch email template
    const [emailRows] = await connection
      .promise()
      .query(
        "SELECT * FROM emails WHERE module = ? AND action = ? AND status = 1",
        [module, action]
      );
    if (emailRows.length === 0) throw new Error("Email template not found");
    const email = emailRows[0];

    // Fetch SMTP credentials
    const [smtpRows] = await connection
      .promise()
      .query(
        "SELECT * FROM smtp_credentials WHERE module = ? AND action = ? AND status = '1'",
        [module, action]
      );
    if (smtpRows.length === 0) throw new Error("SMTP credentials not found");
    const smtp = smtpRows[0];

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
      bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>, "GoldQuest Backup" <gqvtsbackup@goldquestglobal.in>',
      subject: email.title,
      html: template,
    });

    console.log("Email sent successfully:", info.response);
  } catch (error) {
    console.error("Error sending email:", error.message);
  } finally {
    if (connection) {
      connectionRelease(connection); // Ensure the connection is released
    }
  }
}

module.exports = { createMail };
