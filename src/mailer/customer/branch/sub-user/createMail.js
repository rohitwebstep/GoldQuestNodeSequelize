const nodemailer = require("nodemailer");
const { startConnection, connectionRelease } = require("../../../../config/db"); // Import the existing MySQL connection

// Function to send email
async function createMail(
  module,
  action,
  sub_user_email,
  sub_user_password,
  branch_name,
  customer_name,
  toArr,
  ccArr
) {
  const connection = await new Promise((resolve, reject) => {
    startConnection((err, conn) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return reject({
          message: "Failed to connect to the database",
          error: err,
        });
      }
      resolve(conn);
    });
  });

  try {
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

    // Fetch SMTP credentials
    const [appInfoRows] = await connection
      .promise()
      .query(
        "SELECT host FROM app_info WHERE interface_type = ? AND status = '1'",
        ['frontend']
      );
    if (appInfoRows.length === 0) throw new Error("App Info not found");
    const appInfo = appInfoRows[0];

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

    // Replace placeholders in the email template
    let template = email.template;
    template = template
      .replace(/{{email}}/g, sub_user_email)
      .replace(/{{password}}/g, sub_user_password)
      .replace(/{{branch_name}}/g, branch_name)
      .replace(/{{customer_name}}/g, customer_name)
      .replace(/{{login_url}}/g, appInfo.host || 'bgvadmin.goldquestglobal.in');

    // Prepare CC list
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

        return emails
          .filter((email) => email) // Filter out invalid emails
          .map((email) => `"${entry.name}" <${email.trim()}>`) // Trim to remove whitespace
          .join(", ");
      })
      .filter((cc) => cc !== "") // Remove any empty CCs from failed parses
      .join(", ");

    // Validate recipient email(s)
    if (!toArr || toArr.length === 0) {
      throw new Error("No recipient email provided");
    }

    // Prepare recipient list
    const toList = toArr
      .map((email) => `"${email.name}" <${email.email}>`)
      .join(", ");

    // Debugging: Log the email lists
    console.log("Recipient List:", toList);
    console.log("CC List:", ccList);

    // Send email
    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: toList, // Main recipient list
      cc: ccList, // CC recipient list
      bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>, "GoldQuest Backup" <gqvtsbackup@goldquestglobal.in>',
      subject: email.title,
      html: template,
    });

    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  } finally {
    connectionRelease(connection); // Ensure the connection is released
  }
}

module.exports = { createMail };
