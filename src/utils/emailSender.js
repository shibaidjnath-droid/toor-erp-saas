import nodemailer from "nodemailer";

export async function sendEmailWithAttachment({ to, subject, htmlBody, attachment }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Kristal Helder" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html: htmlBody,
    attachments: [attachment],
  });
}
