const nodemailer = require("nodemailer");
const { startConnection, connectionRelease } = require("../../config/db"); // Import the existing MySQL connection

// Function to send email
async function createMail(
  module,
  action,
  name,
  mobile,
  admin_email,
  role,
  profile_url,
  password,
  toArr
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

    let profile_picture_tr = '';
    if (profile_url) {
      profile_url = profile_url.replace(/\\/g, "/");
      profile_picture_tr = `<tr>
        <td><strong>Profile</strong></td>
        <td><img src="${profile_url}" alt="Profile Picture"></td>
    </tr>`;
    }

    // Replace placeholders in the email template
    let template = email.template
      .replace(/{{role}}/g, role)
      .replace(/{{profile_picture_tr}}/g, profile_picture_tr)
      .replace(/{{name}}/g, name)
      .replace(/{{mobile}}/g, mobile)
      .replace(/{{email}}/g, admin_email)
      .replace(/{{name}}/g, name)
      .replace(/{{password}}/g, password);

    // Prepare recipient list based on whether the branch is a head branch
    let recipientList = toArr.map(
      (customer) => `"${customer.name}" <${customer.email}>`
    );
    console.log(`recipientList - `, recipientList);

    // Send email to the prepared recipient list
    const info = await transporter.sendMail({
      from: `"${smtp.title}" <${smtp.username}>`,
      to: recipientList.join(", "), // Join the recipient list into a string
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
