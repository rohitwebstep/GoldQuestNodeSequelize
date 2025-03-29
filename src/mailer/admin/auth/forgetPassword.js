const nodemailer = require("nodemailer");
const { startConnection, connectionRelease } = require("../../../config/db"); // Import the existing MySQL connection

// Function to send email for password reset
async function forgetPassword(module, action, admin_name, reset_link, toArr) {
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
    let template = email.template
      .replace(/{{admin_name}}/g, admin_name)
      .replace(/{{reset_link}}/g, reset_link);

    // Validate recipient email(s)
    if (!Array.isArray(toArr) || toArr.length === 0) {
      throw new Error("No recipient email provided");
    }

    // Prepare recipient list
    const toList = toArr
      .map((recipient) => {
        if (!recipient.email) {
          throw new Error(`Invalid email provided for ${recipient.name}`);
        }
        return `"${recipient.name}" <${recipient.email}>`;
      })
      .join(", ");

    // Send email
    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: toList,
      subject: email.title,
      html: template,
    });

    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Error sending email:", error.message);
  } finally {
    if (connection) {
      connectionRelease(connection); // Ensure the connection is released
    }
  }
}

module.exports = { forgetPassword };
