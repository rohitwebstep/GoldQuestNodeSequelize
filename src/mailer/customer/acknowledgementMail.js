const nodemailer = require("nodemailer");
const { startConnection, connectionRelease } = require("../../config/db"); // Import the existing MySQL connection

// Function to generate an HTML table from branch details
const generateTable = (applications, clientCode, is_head) => {
  let table = "";

  if (is_head == 1) {
    applications.forEach((app) => {
      if (app.branches && Array.isArray(app.branches)) {
        for (const branch of app.branches) {
          // Inline styles for the branch name
          table += `<tr><td colspan="5" style="font-weight: bold; background-color: #f5f5f5; color: #333; padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">${branch.name}</td></tr>`;
          for (const [index, application] of branch.applications.entries()) {
            table += `<tr>
              <td>${index + 1}</td>
              <td>${application.application_id}</td>
              <td>${clientCode}</td>
              <td>${application.name}</td>
              <td>${application.serviceNames}</td>
            </tr>`;
          }
        }
      } else {
        console.error(
          "Error: `app.branches` is not iterable. Please check the data structure."
        );
        table += "<tr><td colspan='5'>Invalid data structure</td></tr>";
      }
    });
  } else {
    applications.forEach((application, index) => {
      table += `<tr>
                  <td>${index + 1}</td>
                  <td>${application.application_id}</td>
                  <td>${clientCode}</td>
                  <td>${application.name}</td>
                  <td>${application.serviceNames}</td>
                </tr>`;
    });
  }

  return table;
};

// Function to send email
async function acknowledgementMail(
  module,
  action,
  is_head,
  branchName,
  clientCode,
  applications,
  toArr,
  ccArr
) {
  let connection;

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
    const table = generateTable(applications, clientCode, is_head);

    // Replace placeholders in the email template
    let template = email.template
      .replace(/{{client_name}}/g, branchName)
      .replace(/{{table_row}}/g, table);

    let recipientList;
    if (is_head === 1) {
      recipientList = toArr.map(
        (customer) => `"${customer.name}" <${customer.email}>`
      );
    } else {
      recipientList = toArr.map(
        (branch) => `"${branch.name}" <${branch.email}>`
      );
    }

    const ccList = ccArr
      .map((entry) => {
        let emails = [];

        try {
          if (Array.isArray(entry.email)) {
            emails = entry.email;
          } else if (typeof entry.email === "string") {
            let cleanedEmail = entry.email
              .trim()
              .replace(/\\"/g, '"')
              .replace(/^"|"$/g, "");

            if (cleanedEmail.startsWith("[") && cleanedEmail.endsWith("]")) {
              emails = JSON.parse(cleanedEmail);
            } else {
              emails = [cleanedEmail];
            }
          }
        } catch (e) {
          console.error("Error parsing email JSON:", entry.email, e);
          return ""; // Skip this entry if parsing fails
        }

        // Ensure it's a valid non-empty string
        return emails
          .filter((email) => email) // Filter out invalid emails
          .map((email) => `"${entry.name}" <${email.trim()}>`) // Trim to remove whitespace
          .join(", ");
      })
      .filter((cc) => cc !== "") // Remove any empty CCs from failed parses
      .join(", ");

    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: recipientList.join(", "),
      cc: ccList,
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

module.exports = { acknowledgementMail };
