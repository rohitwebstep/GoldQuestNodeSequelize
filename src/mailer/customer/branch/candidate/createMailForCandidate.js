const nodemailer = require("nodemailer");
const { startConnection, connectionRelease } = require("../../../../config/db"); // Import the existing MySQL connection

const generateTable = (services) => {
  if (!Array.isArray(services) || services.length === 0) {
      return `<tr>
              <td colspan="3" style="text-align: center;">No instructions available for the selected services.</td>
            </tr>`;
  }

  // console.log("Original Services - ", services);

  const mergedServices = {};

  services.forEach((service) => {
      const match = service.match(/(.*?)(?:[-\s]?(\d+))?:\s*(.*)/);

      if (!match) return;

      const baseTitle = match[1].trim(); // Extracts base title
      const version = match[2] ? match[2].trim() : ""; // Extracts version if present
      const description = match[3].trim(); // Extracts description

      if (typeof description !== "string" || !description.trim() || description.trim().toLowerCase() === "null") {
          return;
      }

      // Use base title as a key
      if (!mergedServices[baseTitle]) {
          mergedServices[baseTitle] = { name: baseTitle, versions: [], descriptions: [] };
      }

      // Append version if not already added
      if (version && !mergedServices[baseTitle].versions.includes(version)) {
          mergedServices[baseTitle].versions.push(version);
      }

      // Append description if not already added
      if (!mergedServices[baseTitle].descriptions.includes(description)) {
          mergedServices[baseTitle].descriptions.push(description);
      }
  });

  // console.log("Merged Services - ", mergedServices);

  const mergedDescriptionsMap = new Map();

  Object.values(mergedServices).forEach(({ name, versions, descriptions }) => {
      const key = descriptions.join(" "); // Using descriptions as key to merge same descriptions
      if (!mergedDescriptionsMap.has(key)) {
          mergedDescriptionsMap.set(key, [{ name, versions }]);
      } else {
          mergedDescriptionsMap.get(key).push({ name, versions });
      }
  });

  const mergedTableHTML = Array.from(mergedDescriptionsMap.entries())
      .map(([description, services], index) => {
          // Format service names with their respective versions
          const serviceNames = services
              .map(({ name, versions }) => versions.length ? `${name} (${versions.join("/")})` : name)
              .join(" / ");

          return `
          <tr>
            <td>${index + 1}</td>
            <td>${serviceNames}</td>
            <td>${description}</td>
          </tr>
        `;
      })
      .join("");

  // console.log(mergedTableHTML);
  return mergedTableHTML;

};

// Function to send email
async function createMailForCandidate(
  module,
  action,
  name,
  customerName,
  application_id,
  href,
  services,
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

    // Generate the HTML table from service details
    const table_rows = generateTable(services);
    // return;
    // Replace placeholders in the email template
    let template = email.template
      .replace(/{{candidate_name}}/g, name)
      .replace(/{{table_rows}}/g, table_rows)
      .replace(/{{company_name}}/g, customerName)
      .replace(/{{form_href}}/g, href);

    // Validate recipient email(s)
    if (!toArr || toArr.length === 0) {
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
      throw new Error(
        "Failed to prepare recipient list due to invalid recipient data"
      );
    }

    const toEmails = toArr.map((email) => email.email.trim().toLowerCase());

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
        // Filter out CC emails that are already in the toList
        return emails
          .filter(
            (email) => email && !toEmails.includes(email.trim().toLowerCase()) // Check against toEmails
          )
          .map((email) => `"${entry.name}" <${email.trim()}>`) // Ensure valid and trimmed emails
          .join(", ");
      })
      .filter((cc) => cc !== "") // Remove any empty CCs from failed parses
      .join(", ");

    // Send email
    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: toList, // Main recipient list
      cc: ccList, // CC recipient list
      bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>, "GoldQuest Backup" <gqvtsbackup@goldquestglobal.in>',
      subject: email.title,
      html: template,
    });

    console.log("Email sent successfully:", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  } finally {
    connectionRelease(connection); // Ensure the connection is released
  }
}

module.exports = { createMailForCandidate };
