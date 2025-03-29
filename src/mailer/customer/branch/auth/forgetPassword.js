const nodemailer = require("nodemailer");
const { sequelize } = require("../../../../config/db"); // Import the existing MySQL connection
const { QueryTypes } = require("sequelize");

// Function to send password reset email
async function forgetPassword(module, action, branch_name, reset_link, toArr) {
  
  try {
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

    // Replace placeholders in the email template
    let template = email.template
      .replace(/{{branch_name}}/g, branch_name)
      .replace(/{{reset_link}}/g, reset_link);

    // Validate recipient email(s)
    if (!Array.isArray(toArr) || toArr.length === 0) {
      throw new Error("No recipient email provided");
    }

    // Prepare recipient list
    const toList = toArr
      .map((recipient) => {
        if (recipient && recipient.name && recipient.email) {
          return `"${recipient.name}" <${recipient.email.trim()}>`;
        }
        console.warn("Invalid recipient object:", recipient);
        return null;
      })
      .filter(Boolean)
      .join(", ");

    if (!toList) {
      throw new Error("Failed to prepare recipient list due to invalid recipient data");
    }

    // Send email
    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: toList,
      subject: email.title,
      html: template,
    });

    console.log("Password reset email sent successfully:", info.response);
  } catch (error) {
    console.error("Error sending password reset email:", error);
  } finally {
}
}

module.exports = { forgetPassword };
