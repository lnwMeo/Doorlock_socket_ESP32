const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

exports.sendApprovalEmail = async (to, subject, html,attachments = []) => {
  await transporter.sendMail({
    from: `"COS SmartLab" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
    attachments,
  });
};
