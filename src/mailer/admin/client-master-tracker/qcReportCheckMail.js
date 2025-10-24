const nodemailer = require("nodemailer");
const path = require("path");
const { sequelize } = require("../../../config/db"); // Import the existing MySQL connection
const { QueryTypes } = require("sequelize");

// Function to check if a file exists
const checkFileExists = async (url) => {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    console.error(`Error checking file existence for ${url}:`, error);
    return false;
  }
};

// Function to create attachments from URLs
const createAttachments = async (attachments_url) => {
  const urls =
    typeof attachments_url === "string" ? attachments_url.split(",") : []; // Default to an empty array if attachments_url is not valid

  const attachments = [];

  for (const url of urls) {
    const trimmedUrl = url.trim(); // Remove any extra whitespace
    if (trimmedUrl) {
      const exists = await checkFileExists(trimmedUrl);
      if (exists) {
        const trimmedSenitizedUrl = trimmedUrl.replace(/\\/g, "/");
        const filename = path.basename(trimmedUrl); // Extract the filename from the URL
        attachments.push({
          filename: filename,
          path: trimmedSenitizedUrl,
        });
      } else {
        console.warn(`File does not exist: ${trimmedUrl}`); // Log warning for missing file
      }
    } else {
      console.warn(`Empty or invalid URL: ${url}`); // Log warning for invalid URL
    }
  }

  return attachments;
};

// Function to send email
async function qcReportCheckMail(
  mailModule,
  action,
  gender_title,
  client_name,
  application_id,
  attachments_url,
  toArr,
  ccArr
) {

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
      secure: smtp.secure,
      auth: {
        user: smtp.username,
        pass: smtp.password,
      },
    });

    // Replace placeholders in the email template
    let template = email.template
      .replace(/{{gender_title}}/g, gender_title)
      .replace(/{{client_name}}/g, client_name)
      .replace(/{{application_id}}/g, application_id);

    // Prepare CC list
    const ccList = ccArr
      .map((entry) => {
        let emails = [];
        try {
          if (Array.isArray(entry.email)) {
            emails = entry.email;
          } else if (typeof entry.email === "string") {
            const cleanedEmail = entry.email
              .trim()
              .replace(/\\"/g, '"')
              .replace(/^"|"$/g, "");
            emails =
              cleanedEmail.startsWith("[") && cleanedEmail.endsWith("]")
                ? JSON.parse(cleanedEmail)
                : [cleanedEmail];
          }
        } catch (e) {
          console.error("Error parsing email JSON:", entry.email, e);
          return ""; // Skip this entry if parsing fails
        }
        return emails
          .filter((email) => email)
          .map((email) => `"${entry.name}" <${email.trim()}>`)
          .join(", ");
      })
      .filter((cc) => cc !== "")
      .join(", ");

    // Add "GQG HRSPL" email to CC
    // const additionalCc = '"GQG HRSPL" <reportsatgoldquest@gmail.com>';
    const additionalCc = '';
    const finalCcList = ccList ? `${ccList}, ${additionalCc}` : additionalCc;

    // Validate recipient email(s)
    if (!toArr || toArr.length === 0) {
      throw new Error("No recipient email provided");
    }

    // Prepare recipient list
    const toList = toArr
      .map((email) => `"${email.name}" <${email.email.trim()}>`)
      .join(", ");

    // Create attachments
    const attachments = await createAttachments(attachments_url);

    // Send email
    const mailOptions = {
      from: `"${smtp.title}" <${smtp.username}>`,
      to: toList,
      cc: finalCcList,
      bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>',
      subject: email.title,
      html: template,
      ...(attachments.length > 0 && { attachments }),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  } finally {
  }
}

module.exports = { qcReportCheckMail };
