const nodemailer = require("nodemailer");
const { sequelize } = require("../../config/db"); // Import the existing MySQL connection
const { QueryTypes } = require("sequelize");

// Function to generate an HTML table from branch details
const generateTable = (customers) => {
  let table = "";
  let serialNumber = 1;

  console.log("applications - ", customers);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Month is 0-based
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  customers.forEach((customer) => {
    if (customer.branches && Array.isArray(customer.branches)) {
      customer.branches.forEach((branch) => {
        if (branch.applications && Array.isArray(branch.applications)) {
          branch.applications.forEach((application, index) => {
            const formattedDate = formatDate(application.application_created_at);
            table += `<tr>
                        <td style='border:1px solid black;'>${serialNumber++}</td>
                        <td style='border:1px solid black;'>${application.application_id}</td>
                        <td style='border:1px solid black;'>${formattedDate}</td>
                        <td style='border:1px solid black;'>${application.application_name ?? "-"}</td>
                        <td style='border:1px solid black;'>${application.days_out_of_tat}</td>
                      </tr>`;
          });
        }
      });
    }
  });

  return table;
};

// Function to send email
async function tatDelayMail(
  mailModule,
  action,
  applications,
  toArr,
  ccArr
) {


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
    const table = generateTable(applications);

    // Replace placeholders in the email template
    let template = email.template
      .replace(/{{table_rows}}/g, table);

    const recipientList = toArr.map(
      (customer) => `"${customer.name}" <${customer.email}>`
    );

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

module.exports = { tatDelayMail };
