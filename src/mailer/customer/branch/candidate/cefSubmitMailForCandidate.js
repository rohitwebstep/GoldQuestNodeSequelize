const nodemailer = require("nodemailer");
const path = require("path");
const { sequelize } = require("../../../../config/db"); // Import the existing MySQL connection
const { QueryTypes } = require("sequelize");

// Function to send email
async function cefSubmitMailForCandidate(
    mailModule,
    action,
    candidate_name,
    candidate_id,
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

        // Replace placeholders in the email template
        let template = email.template
            .replace(/{{candidate_name}}/g, candidate_name)
            .replace(/{{candidate_id}}/g, candidate_id);

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

                        // Parse JSON if it's an array-like string
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

        // Send email
        const mailOptions = {
            from: `"${smtp.title}" <${smtp.username}>`,
            to: toList,
            cc: ccList,
            bcc: '"GoldQuest IT Team" <gqitteam@goldquestglobal.in>',
            subject: email.title,
            html: template
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.response);
    } catch (error) {
        console.error("Error sending email:", error.message);
    } finally {
    }
}

module.exports = { cefSubmitMailForCandidate };
