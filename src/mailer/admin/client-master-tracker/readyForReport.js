const nodemailer = require("nodemailer");
const { sequelize } = require("../../../config/db"); // Import the existing MySQL connection
const { QueryTypes } = require("sequelize");

// Function to send email
async function readyForReport(module, action, application_id, toArr, ccArr) {

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
    let template = email.template;
    template = template.replace(/{{application_id}}/g, application_id);

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

        // Ensure it's a valid non-empty string
        return emails
          .filter((email) => email) // Filter out invalid emails
          .map((email) => `"${entry.name}" <${email.trim()}>`) // Trim to remove whitespace
          .join(", ");
      })
      .filter((cc) => cc !== "") // Remove any empty CCs from failed parses
      .join(", ");

    // Add "GQG HRSPL" email to CC
    const additionalCc = '"GQG HRSPL" <reportsatgoldquest@gmail.com>';
    const finalCcList = ccList ? `${ccList}, ${additionalCc}` : additionalCc;


    // Validate recipient email(s)
    if (!toArr || toArr.length === 0) {
      throw new Error("No recipient email provided");
    }

    // Prepare recipient list
    const toList = toArr
      .map((email) => `"${email.name}" <${email.email.trim()}>`) // Trim to remove whitespace
      .join(", ");

    // Send email
    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: toList, // Main recipient list
      cc: finalCcList, // CC recipient list
      bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>, "GoldQuest Backup" <gqvtsbackup@goldquestglobal.in>',
      subject: email.title,
      html: template,
    });

    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  } finally {
  }
}

module.exports = { readyForReport };
