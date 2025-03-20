const nodemailer = require("nodemailer");
const { startConnection, connectionRelease } = require("../../../../config/db"); // Import the existing MySQL connection

// Function to send email
async function davMail(
  module,
  action,
  candidate_name,
  company_name,
  href,
  toArr
) {
  let connection;
  try {
    // Establish database connection
    connection = await new Promise((resolve, reject) => {
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

    // Replace placeholders in the email template
    let template = email.template;
    template = template
      .replace(/{{candidate_name}}/g, candidate_name)
      .replace(/{{company_name}}/g, company_name)
      .replace(/{{url}}/g, href);

    // Validate and prepare recipient email list
    if (!Array.isArray(toArr) || toArr.length === 0) {
      throw new Error("No recipient email provided");
    }

    const toList = toArr
      .map((item) => {
        if (!item.email) {
          throw new Error(`No valid email provided for ${item.name}`);
        }
        return `"${item.name}" <${item.email}>`;
      })
      .join(", ");

    // Send email
    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: toList,
      bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>, "GoldQuest Backup" <gqvtsbackup@goldquestglobal.in>',
      subject: email.title,
      html: template,
    });

    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  } finally {
    if (connection) {
      connectionRelease(connection); // Ensure the connection is released
    }
  }
}

module.exports = { davMail };
